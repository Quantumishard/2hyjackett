const express = require("express");
const app = express();
const fetch = require("node-fetch");
const parseTorrent = require("parse-torrent");
const torrentStream = require("torrent-stream");

const bodyParser = require("body-parser");

const host1 = "http://129.153.72.60:9117"; // Existing Jackett server
const host2 = "http://94.61.74.253:9117"; // New Jackett server URL (same endpoint)
const apiKey1 = "k7lsbawbs4aq8t1s56c58jm091gm7mk7"; // API key for existing Jackett server
const apiKey2 = "e71yh2n0fopfnyk2j2ywzjfa3sz4xv8d"; // API key for new Jackett server

const fetchTorrent = async (query) => {
  // Fetch torrents from both host1 and host2
  const urls = [
  `${host1}/api/v2.0/indexers/all/results?apikey=${apiKey1}&Query=${query}&Category%5B%5D=2000&Category%5B%5D=5000&Tracker%5B%5D=bitsearch&Tracker%5B%5D=bulltorrent&Tracker%5B%5D=solidtorrents`,
  `${host2}/api/v2.0/indexers/all/results?apikey=${apiKey2}&Query=${query}&Category%5B%5D=2000&Category%5B%5D=5000&Tracker%5B%5D=piratebay&Tracker%5B%5D=1337x`
];

  ];

  try {
    const responses = await Promise.all(urls.map(url =>
      fetch(url, {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "x-requested-with": "XMLHttpRequest",
          cookie: "Jackett=YOUR_COOKIE_HERE", // Replace with your host cookie
        },
        referrerPolicy: "no-referrer",
        method: "GET",
      })
    ));

    const results = await Promise.all(responses.map(async (response) => {
      if (!response.ok) {
        console.error("Error fetching torrents. Status:", response.status);
        return [];
      }

      const data = await response.json();
      return data["Results"];
    }));

    // Combine results from both host1 and host2
    const combinedResults = results.flat();

    console.log({ Initial: combinedResults.length });

    if (combinedResults.length !== 0) {
      return combinedResults.map((result) => ({
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

// ... (rest of the code remains the same)

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

app.get("/manifest.json", (req, res) => {
  const manifest = {
    id: "mikmc.od.org+++",
    version: "3.0.0",
    name: "HYJackett",
    description: "Movie & TV Streams from Jackett",
    logo: "https://raw.githubusercontent.com/mikmc55/hyackett/main/hyjackett.jpg",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
  };

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  return res.send(manifest);
});

app.get("/stream/:type/:id", async (req, res) => {
  const media = req.params.type;
  let id = req.params.id;
  id = id.replace(".json", "");

  let [tt, s, e] = id.split(":");
  let query = "";
  let meta = await getMeta(tt, media);

  query = meta?.name;

  if (media === "movie") {
    query += " " + meta?.year;
  } else if (media === "series") {
    query += " S" + (s ?? "1").padStart(2, "0");
  }
  query = encodeURIComponent(query);

  let result = await fetchTorrent(query);

  let stream_results = await Promise.all(
    result.map((torrent) => {
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

  stream_results = Array.from(new Set(stream_results)).filter((e) => !!e);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");

  return res.send({ streams: stream_results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("The server is working on port " + port);
});
