# Moonlight Music Backend (Python FastAPI) 🌙

High-speed YouTube Music search & audio streaming backend designed specifically for the **Moonlight Music** mobile application.

---

## ⚡ Features
- 🔍 **Real YouTube Music Search**: Fetches songs with accurate Artist names, Album titles, and high-resolution Album Art.
- 🎵 **Direct Audio Stream Extraction**: Extracts high-bitrate `.m4a` audio stream links powered by `yt-dlp`.
- ⚡ **In-Memory Link Cache**: Caches stream URLs so repeat plays start instantaneously.
- 🛡️ **Built-in Audio Stream Proxy**: Supports HTTP Range headers for smooth seeking in `expo-audio`.
- 🔥 **Trending Charts**: Real-time trending songs from YouTube Music (India / Global).
- 🌐 **CORS Preconfigured**: Works out-of-the-box with React Native, Expo, and Web.

---

## 🚀 Local Run (On your PC)

### 1. Requirements
Open terminal in `backend/` folder and install dependencies:
```bash
pip install -r requirements.txt
```

### 2. Start Server
```bash
python -m uvicorn main:app --reload --port 8000
```

The server will be live at:
- **API URL**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

## ☁️ 100% Free Cloud Deployment (Render.com)

To get a permanent public `https://your-api.onrender.com` URL that your phone can access from anywhere:

1. Push your repository to **GitHub**.
2. Go to [Render.com](https://render.com) and create a free account.
3. Click **New +** $\rightarrow$ **Web Service**.
4. Connect your GitHub repository.
5. In Settings:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
6. Click **Deploy Web Service**!
7. Within 2-3 minutes, you will get your live URL: `https://moonlight-music-api.onrender.com`.

---

## 📡 API Endpoints

### 1. Health Check
`GET /`
```json
{
  "status": "online",
  "service": "Moonlight Music API",
  "version": "1.0.0"
}
```

### 2. Search Songs
`GET /api/search?q=Kesariya`
```json
{
  "query": "Kesariya",
  "count": 20,
  "songs": [
    {
      "id": "BddP6PYo2gs",
      "title": "Kesariya",
      "artist": "Arijit Singh, Pritam, Amitabh Bhattacharya",
      "album": "Brahmastra",
      "duration": 268,
      "coverUrl": "https://lh3.googleusercontent.com/...",
      "source": "youtube"
    }
  ]
}
```

### 3. Get Audio Stream URL
`GET /api/stream/{video_id}`
```json
{
  "id": "BddP6PYo2gs",
  "title": "Kesariya",
  "artist": "Arijit Singh",
  "audioUrl": "https://rr3---sn-....googlevideo.com/videoplayback?...",
  "format": "m4a",
  "bitrate": 160,
  "coverUrl": "https://i.ytimg.com/...",
  "expiresAt": 1730320000
}
```

### 4. Audio Proxy (Fallback for Restricted Networks)
`GET /api/proxy/{video_id}`
Streams audio bytes with Range header support for seeking.

### 5. Trending Songs
`GET /api/trending?country=IN`
Returns top trending songs in India from YouTube Music charts.
