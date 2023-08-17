const parseTorrent = require("parse-torrent");
const express = require("express");
const app = express();
const fetch = require("node-fetch");
const torrentStream = require("torrent-stream");

const bodyParser = require("body-parser");

function getSize(size) {
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;

  return (
    "💾 " +
    (size / gb > 1 ? `${(size / gb).toFixed(2)} GB` : `${(size / mb).toFixed(2)} MB`)
  );
}

function getQuality(name) {
  name = name.toLowerCase();

  if (["2160", "4k", "uhd"].some((x) => name.includes(x))) return "🌟4k";
  if (["1080", "fhd"].some((x) => name.includes(x))) return " 🎥FHD";
  if (["720", "hd"].some((x) => name.includes(x))) return "📺HD";
  if (["480p", "380p", "sd"].some((x) => name.includes(x))) return "📱SD";
  return "";
}

const toStream = async (parsed, uri, tor, type, s, e) => {
  const infoHash = parsed.infoHash.toLowerCase();
  let title = tor.extraTag || parsed.name;
  let index = 0;

  if (!parsed.files && uri.startsWith("magnet")) {
    try {
      const engine = torrentStream("magnet:" + uri, {
        connections: 10, // Limit the number of connections/streams
      });

      const res = await new Promise((resolve, reject) => {
        engine.on("ready", function () {
          resolve(engine.files);
        });

        setTimeout(() => {
          resolve([]);
        }, 10000); // Timeout if the server is too slow
      });

      parsed.files = res;
      engine.destroy();
    } catch (error) {
      // Handle any errors here
      console.error("Error fetching torrent data:", error);
    }
  }

  if (type === "series") {
    index = (parsed.files || []).findIndex((element) => {
      return (
        element["name"]?.toLowerCase()?.includes(`s0${s}`) &&
        element["name"]?.toLowerCase()?.includes(`e0${e}`) &&
        [".mkv", ".mp4", ".avi", ".flv"].some((ext) =>
          element["name"]?.toLowerCase()?.includes(ext)
        )
      );
    });

    if (index === -1) {
      return null;
    }
    title += index === -1 ? "" : `\n${parsed.files[index]["name"]}`;
  }

  title += "\n" + getQuality(title);

  const subtitle = "S:" + tor["Seeders"] + " /P:" + tor["Peers"];
  title += ` | ${
    index === -1
      ? `${getSize(parsed.length || 0)}`
      : `${getSize((parsed.files && parsed.files[index]?.length) || 0)}`
  } | ${subtitle} `;

  return {
    name: tor["Tracker"],
    type,
    infoHash,
    fileIdx: index === -1 ? 0 : index,
    sources: (parsed.announce || []).map((x) => {
      return "tracker:" + x;
    }).concat(["dht:" + infoHash]),
    title,
    behaviorHints: {
      bingeGroup: `Jackett-Addon|${infoHash}`,
      notWebReady: true,
    },
  };
};

const isRedirect = async (url) => {
  try {
    const controller = new AbortController();
    // 5-second timeout:
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 301 || response.status === 302) {
      const locationURL = new URL(
        response.headers.get("location"),
        response.url
      );
      if (locationURL.href.startsWith("http")) {
        return await isRedirect(locationURL);
      } else {
        return locationURL.href;
      }
    } else if (response.status >= 200 && response.status < 300) {
      return response.url;
    } else {
      return null;
    }
  } catch (error) {
    // Handle any errors here
    console.error("Error while following redirection:", error);
    return null;
  }
};

const streamFromMagnet = (tor, uri, type, s, e) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Follow redirection in case the URI is not directly accessible
      const realUrl = uri?.startsWith("magnet:?") ? uri : await isRedirect(uri);

      if (!realUrl) {
        console.log("No real URL found.");
        resolve(null);
        return;
      }

      if (realUrl.startsWith("magnet:?")) {
        const parsedTorrent = parseTorrent(realUrl);
        resolve(await toStream(parsedTorrent, realUrl, tor, type, s, e));
      } else if (realUrl.startsWith("http")) {
        parseTorrent.remote(realUrl, (err, parsed) => {
          if (!err) {
            resolve(toStream(parsed, realUrl, tor, type, s, e));
          } else {
            console.error("Error parsing HTTP:", err);
            resolve(null);
          }
        });
      } else {
        console.error("No HTTP nor magnet URI found.");
        resolve(null);
      }
    } catch (error) {
      console.error("Error while streaming from magnet:", error);
      resolve(null);
    }
  });
};

let stream_results = [];
let torrent_results = [];

const host1 = {
  hostUrl: "http://129.153.72.60:9117",
  apiKey: "k7lsbawbs4aq8t1s56c58jm091gm7mk7",
};

const host2 = {
  hostUrl: "http://94.61.74.253:9117",
  apiKey: "e71yh2n0fopfnyk2j2ywzjfa3sz4xv8d",
};

const fetchTorrentFromHost1 = async (query) => {
  const url = `${host1.hostUrl}/api/v2.0/indexers/all/results/torznab/api?apikey=${host1.apiKey}&q=${query}&t=movie&cat=2000`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching torrent data from host1:", error);
    return [];
  }
};

const fetchTorrentFromHost2 = async (query) => {
  const url = `${host2.hostUrl}/api/v2.0/indexers/all/results/torznab/api?apikey=${host2.apiKey}&q=${query}&t=movie&cat=2000`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching torrent data from host2:", error);
    return [];
  }
};

const fetchTorrent = async (query) => {
  const [results1, results2] = await Promise.all([
    fetchTorrentFromHost1(query),
    fetchTorrentFromHost2(query),
  ]);

  const allResults = [...results1, ...results2];
  return allResults;
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/manifest.json", (req, res) => {
  const manifest = {
    id: "torrent-streamer",
    version: "1.0.0",
    name: "Torrent Streamer",
    description: "Stream torrents from various sources.",
    types: ["movie", "series"],
  };
  res.json(manifest);
});

app.get("/stream/:type/:id", async (req, res) => {
  const type = req.params.type;
  const id = req.params.id;
  let s = req.query.s || 1;
  let e = req.query.e || 1;
  const limit = req.query.limit || 10;

  const query = encodeURIComponent(id);
  stream_results = [];
  torrent_results = await fetchTorrent(query);

  if (type === "series") {
    const streamPromises = [];
    for (let i = 0; i < torrent_results.length; i++) {
      const tor = torrent_results[i];
      const uri = tor["MagnetUri"];
      streamPromises.push(streamFromMagnet(tor, uri, type, s, e));
    }
    stream_results = await Promise.all(streamPromises);
  } else {
    const streamPromises = torrent_results.map((tor) =>
      streamFromMagnet(tor, tor["MagnetUri"], type, s, e)
    );
    stream_results = await Promise.all(streamPromises);
  }

  const validStreams = stream_results.filter((stream) => stream !== null);

  const response = {
    total: validStreams.length,
    results: validStreams.slice(0, limit),
  };
  res.json(response);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("The server is working on port " + port);
});
