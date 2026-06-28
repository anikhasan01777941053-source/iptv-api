const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const APP_SECRET = process.env.APP_SECRET;
const API_KEY = process.env.API_KEY;
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
function verifyToken(req, res, next) {

    const auth = req.headers.authorization;

    if (!auth) {
        return res.status(401).json({
            status: false,
            message: "Token Missing"
        });
    }

    const token = auth.replace("Bearer ", "");

    try {

        jwt.verify(token, JWT_SECRET);

        next();

    } catch (e) {

        return res.status(401).json({
            status: false,
            message: "Invalid Token"
        });

    }

}
app.post("/auth", (req, res) => {

    const appSecret = req.headers["x-app-secret"];
    const deviceId = req.headers["x-device-id"];

    if (appSecret !== APP_SECRET) {
        return res.status(401).json({
            status: false,
            message: "Unauthorized"
        });
    }

    const token = jwt.sign(
        {
            device: deviceId
        },
        JWT_SECRET,
        {
            expiresIn: "1h"
        }
    );

    res.json({
        status: true,
        token: token
    });

});
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

const JSON_URL =
"https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/Channels_data.json";

let channels = [];
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 minutes

async function loadPlaylist() {
    const now = Date.now();

    if (channels.length > 0 && (now - lastUpdate) < CACHE_TIME) {
        return channels;
    }

    const [response, jsonResponse] = await Promise.all([
    axios.get(PLAYLIST_URL),
    axios.get(JSON_URL)
]);

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
    const jsonChannels = jsonResponse.data.channels || [];

jsonChannels.forEach(item => {

    const exists = list.find(channel =>

        channel.name.trim().toLowerCase() ===
        item.name.trim().toLowerCase()

    );

    if (!exists) {

        list.push({

            id: list.length + 1,

            name: item.name,

            tvgId: "",

            tvgName: item.name,

            group: "Other",

            logo: "https://placehold.co/300x300?text=TV",

            url: item.url

        });

    }

});

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

app.get("/playlist", verifyToken, async (req, res) => {

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

app.get("/channel/:id", verifyToken, async (req, res) => {

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
app.get("/search", verifyToken, async (req, res) => {

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
app.get("/groups", verifyToken, async (req, res) => {

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
    app.get("/group/:name", verifyToken, async (req, res) => {

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

app.get("/stats", verifyToken, async (req, res) => {

    const data = await loadPlaylist();

    const groups = [...new Set(data.map(x => x.group))];

    res.json({
        status: true,
        channels: data.length,
        groups: groups.length,
        cache: new Date(lastUpdate).toISOString()
    });

});
app.get("/random", verifyToken, async (req, res) => {

    const data = await loadPlaylist();

    const item = data[Math.floor(Math.random() * data.length)];

    res.json(item);

});
app.get("/recent", verifyToken, async (req, res) => {

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
