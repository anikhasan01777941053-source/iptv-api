const API_KEY = "MOVEXA_2026_SECRET";
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());

app.use((req, res, next) => {

    const apiKey = req.headers["x-api-key"];

    if (apiKey !== API_KEY) {
        return res.status(401).json({
            status: false,
            message: "Unauthorized"
        });
    }

    next();

});

const PLAYLIST_URL = "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u";

let channels = [];
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 minutes

async function loadPlaylist() {
    const now = Date.now();

    if (channels.length > 0 && (now - lastUpdate) < CACHE_TIME) {
        return channels;
    }

    const response = await axios.get(PLAYLIST_URL);

    const lines = response.data.split(/\r?\n/);

    const list = [];
    let current = null;

    for (const raw of lines) {
        const line = raw.trim();

        if (!line) continue;

        if (line.startsWith("#EXTINF")) {

            const name = line.includes(",") ? line.substring(line.lastIndexOf(",") + 1).trim() : "";

            let logo = "";
            let group = "";
            let tvgId = "";
            let tvgName = "";

            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            if (logoMatch) logo = logoMatch[1];

            const groupMatch = line.match(/group-title="([^"]*)"/);
            if (groupMatch) group = groupMatch[1];

            const idMatch = line.match(/tvg-id="([^"]*)"/);
            if (idMatch) tvgId = idMatch[1];

            const nameMatch = line.match(/tvg-name="([^"]*)"/);
            if (nameMatch) tvgName = nameMatch[1];

            current = {
                id: list.length + 1,
                name,
                tvgId,
                tvgName,
                group,
                logo: logo || "https://placehold.co/300x300?text=TV"
            };

        } else if (
            current &&
            (line.startsWith("http://") || line.startsWith("https://"))
        ) {

            current.url = line;

            list.push(current);

            current = null;
        }
    }

    channels = list;
    lastUpdate = now;

    return channels;
}

app.get("/", async (req, res) => {

    const data = await loadPlaylist();

    res.json({
        status: true,
        total: data.length,
        endpoints: [
            "/playlist",
            "/channel/:id",
            "/search?q=name",
            "/groups",
            "/group/:name"
        ]
    });

});

app.get("/playlist", async (req, res) => {

    const data = await loadPlaylist();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const start = (page - 1) * limit;
    const end = start + limit;

    const result = data.slice(start, end);

    res.json({

        status: true,

        total: data.length,

        page: page,

        limit: limit,

        totalPages: Math.ceil(data.length / limit),

        channels: result

    });

});

app.get("/channel/:id", async (req, res) => {

    const data = await loadPlaylist();

    const item = data.find(c => c.id == req.params.id);

    if (!item) {
        return res.status(404).json({
            status: false,
            message: "Channel not found"
        });
    }

    res.json(item);

});

app.get("/search", async (req, res) => {

    const keyword = (req.query.q || "").toLowerCase();

    const data = await loadPlaylist();

    const result = data.filter(item =>
        item.name.toLowerCase().includes(keyword)
    );

    res.json({
        status: true,
        total: result.length,
        channels: result
    });

});

app.get("/groups", async (req, res) => {

    const data = await loadPlaylist();

    const groups = {};

    data.forEach(item => {
        if (!groups[item.group]) {
            groups[item.group] = 0;
        }
        groups[item.group]++;
    });

    res.json(groups);

});
    app.get("/group/:name", async (req, res) => {

    const data = await loadPlaylist();

    const result = data.filter(item =>
        item.group.toLowerCase() === req.params.name.toLowerCase()
    );

    res.json({
        status: true,
        total: result.length,
        channels: result
    });

});

app.get("/stats", async (req, res) => {

    const data = await loadPlaylist();

    const groups = [...new Set(data.map(x => x.group))];

    res.json({

        status: true,

        channels: data.length,

        groups: groups.length,

        cache: new Date(lastUpdate).toISOString()

    });

});
app.get("/random", async (req, res) => {

    const data = await loadPlaylist();

    const item = data[Math.floor(Math.random() * data.length)];

    res.json(item);

});
app.get("/recent", async (req, res) => {

    const data = await loadPlaylist();

    res.json(data.slice(-20).reverse());

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("=================================");
    console.log(" IPTV API Started Successfully");
    console.log(" Server : http://localhost:" + PORT);
    console.log(" Playlist : http://localhost:" + PORT + "/playlist");
    console.log("=================================");
});
