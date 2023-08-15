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
    const response = await fetch(url, {
      redirect: "manual",
    });

    if (response.status === 301 || response.status === 302) {
      const locationURL = new URL(response.headers.get("location"), response.url);
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
    console.error("Error while following redirection:", error);
    return null;
  }
};

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

// ...

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
        parseTorrent.remote(realUrl, async (err, parsed) => { // Add async here
          if (!err) {
            resolve(await toStream(parsed, realUrl, tor, type, s, e));
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
  hostUrl: "http:/129.153.72.60:9117",
  apiKey: "k7lsbawbs4aq8t1s56c58jm091gm7mk7",
};

const host2 = {
  hostUrl: "http://94.61.74.253:9117",  // Replace with the URL of the second indexer
  apiKey: "e71yh2n0fopfnyk2j2ywzjfa3sz4xv8d",         // Replace with the API key for the second indexer
};

const fetchTorrentFromHost = async (query, hostInfo) => {
  const { hostUrl, apiKey } = hostInfo;

  let url = `${hostUrl}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${query}&Category[]=2000&Category[]=5000&Tracker[]=bitsearch&Tracker[]=thepiratebay&Tracker[]=bulltorrent&Tracker[]=1337x&Tracker[]=solidtorrents`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "x-requested-with": "XMLHttpRequest",
        // Set appropriate headers for the host (you may need to customize this)
        // cookie: "Jackett=...",  // Uncomment and add the cookie if needed
      },
      referrerPolicy: "no-referrer",
      method: "GET",
    });

    if (!response.ok) {
      console.error("Error fetching torrents. Status:", response.status);
      return [];
    }

    const results = await response.json();
    console.log({ Initial: results["Results"].length });

    if (results["Results"].length !== 0) {
      return results["Results"].map((result) => ({
        Tracker: result["Tracker"],
        Category: result["CategoryDesc"],
        Title: result["Title"],
        Seeders: result["Seeders"],
        Peers: result["Peers"],
        Link: result["Link"],
        MagnetUri: result["MagnetUri"],
      }));
    } else {
      return [];
    }
  } catch (error) {
    // Handle any errors here
    console.error("Error fetching torrents:", error);
    return [];
  }
};

function getMeta(id, type) {
  var [tt, s, e] = id.split(":");

  return fetch(`https://v2.sg.media-imdb.com/suggestion/t/${tt}.json`)
    .then((res) => res.json())
    .then((json) => json.d[0])
    .then(({ l, y }) => ({ name: l, year: y }))
    .catch((err) =>
      fetch(`https://v3-cinemeta.strem.io/meta/${type}/${tt}.json`)
        .then((res) => res.json())
        .then((json) => json.meta)
    );
}

app.get("/stream/:type/:id", async (req, res) => {
  const media = req.params.type;
  let id = req.params.id;
  id = id.replace(".json", "");

  let [tt, s, e] = id.split(":");
  let query = "";
  let meta = await getMeta(tt, media);

  console.log({ meta: id });
  console.log({ meta });
  query = meta?.name;

  if (media === "movie") {
    query += " " + meta?.year;
  } else if (media === "series") {
    query += " S" + (s ?? "1").padStart(2, "0");
  }
  query = encodeURIComponent(query);

  // Fetch torrents from both hosts
  const result1 = await fetchTorrentFromHost(query, host1);
  const result2 = await fetchTorrentFromHost(query, host2);

  // Combine results from both hosts
  const combinedResults = result1.concat(result2);

  // Process and filter the combined results
  const uniqueResults = Array.from(new Set(combinedResults.map(JSON.stringify))).map(JSON.parse);

  // Filter torrents based on seeders and stream results
  let stream_results = await Promise.all(
  sortedResults.map((torrent) => {
    if (
      (torrent["MagnetUri"] != "" || torrent["Link"] != "") &&
      torrent["Peers"] > 1
    ) {
      return streamFromMagnet(
        torrent,
        torrent["MagnetUri"] || torrent["Link"],
        media,
        s,
        e
      );
    }
  })
);

// Filter out null results and sort by quality (high to low)
stream_results = stream_results.filter((result) => result !== null);
stream_results.sort((a, b) => {
  const qualityOrder = { "🌟4k": 4, " 🎥FHD": 3, "📺HD": 2, "📱SD": 1 };

  const qualityIndexA = qualityOrder[a.title.split("|")[1].trim()];
  const qualityIndexB = qualityOrder[b.title.split("|")[1].trim()];

  if (qualityIndexA === qualityIndexB) {
    // If qualities are the same, sort by seeders (high to low)
    return b.name.Seeders - a.name.Seeders;
  }

  return qualityIndexB - qualityIndexA;
});

// Send the sorted stream results as the response
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Headers", "*");
res.setHeader("Content-Type", "application/json");
res.send({ streams: stream_results });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");

  console.log({ check: "check" });
  console.log({ Final: stream_results.length });

  return res.send({ streams: stream_results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("The server is working on port " + port);
});
