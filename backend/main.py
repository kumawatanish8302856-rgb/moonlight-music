import os
import time
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from ytmusicapi import YTMusic
import yt_dlp
try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    HAS_IMPERSONATE = True
except Exception:
    HAS_IMPERSONATE = False

app = FastAPI(
    title="Moonlight Music API",
    description="High-speed YouTube Music search & audio streaming backend for Moonlight Music",
    version="1.0.0"
)

# Enable CORS for mobile app & web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize YouTube Music client (Unauthenticated public mode)
ytm = YTMusic()

# Simple in-memory stream cache (video_id -> {audioUrl, expiresAt, metadata})
stream_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3 * 3600  # 3 hours (YouTube stream URLs typically last 6 hours)

def clean_thumbnail(thumbnails: List[Dict[str, Any]]) -> str:
    """Return the highest resolution thumbnail from YouTube thumbnail array."""
    if not thumbnails:
        return ""
    # Sort thumbnails by resolution (width x height or just width)
    sorted_thumbs = sorted(
        thumbnails,
        key=lambda t: t.get("width", 0) * t.get("height", 0),
        reverse=True
    )
    url = sorted_thumbs[0].get("url", "")
    # Upscale YouTube image thumbnail if standard size
    if "=w" in url and "-h" in url:
        url = url.split("=")[0] + "=w800-h800-l90-rj"
    return url

def parse_duration(duration_str: Optional[str]) -> int:
    """Convert mm:ss or hh:mm:ss to seconds integer."""
    if not duration_str:
        return 0
    parts = duration_str.strip().split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(parts[0])
    except ValueError:
        pass
    return 0

@app.get("/")
def health_check():
    return {
        "status": "online",
        "service": "Moonlight Music API",
        "version": "1.0.3",
        "commit": "curl-cffi-impersonate",
        "impersonate": HAS_IMPERSONATE,
        "endpoints": {
            "search": "/api/search?q={query}",
            "stream": "/api/stream/{video_id}",
            "proxy": "/api/proxy/{video_id}",
            "trending": "/api/trending"
        }
    }

@app.get("/api/search")
def search_songs(q: str = Query(..., min_length=1, description="Search song title or artist")):
    """
    Search YouTube Music for tracks matching the query.
    Returns clean JSON compatible with Moonlight Player.
    """
    try:
        results = ytm.search(q, filter="songs", limit=25)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    songs = []
    for item in results:
        video_id = item.get("videoId")
        if not video_id:
            continue

        artists = [a.get("name", "") for a in item.get("artists", []) if a.get("name")]
        artist_str = ", ".join(artists) if artists else "Unknown Artist"

        album_info = item.get("album")
        album_name = album_info.get("name", "YouTube Music") if album_info else "YouTube Music"

        duration_sec = item.get("duration_seconds")
        if not duration_sec:
            duration_sec = parse_duration(item.get("duration", "0:00"))

        songs.append({
            "id": video_id,
            "title": item.get("title", "Unknown Title"),
            "artist": artist_str,
            "album": album_name,
            "duration": duration_sec,
            "coverUrl": clean_thumbnail(item.get("thumbnails", [])),
            "source": "youtube"
        })

    return {"query": q, "count": len(songs), "songs": songs}

@app.get("/api/stream/{video_id}")
def get_stream_url(video_id: str):
    """
    Extract direct high quality audio streaming URL for a given YouTube video ID.
    Uses cached link if still valid.
    """
    now = time.time()
    cached = stream_cache.get(video_id)
    if cached and cached.get("expiresAt", 0) > now:
        return cached

    ydl_opts = {
        "format": "140/ba/b",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "extract_flat": False,
        "remote_components": ["ejs:github"],
    }
    if HAS_IMPERSONATE:
        try:
            ydl_opts["impersonate"] = ImpersonateTarget.from_str("chrome")
        except Exception:
            pass

    cookie_content = os.environ.get("YOUTUBE_COOKIES")
    if cookie_content:
        cookie_path = os.path.join(os.environ.get("TMPDIR", "/tmp"), "youtube_cookies.txt")
        try:
            with open(cookie_path, "w", encoding="utf-8") as cf:
                cf.write(cookie_content)
            ydl_opts["cookiefile"] = cookie_path
        except Exception:
            pass

    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract audio: {str(e)}")

    audio_url = info.get("url")
    if not audio_url:
        raise HTTPException(status_code=404, detail="No suitable audio stream found")

    result = {
        "id": video_id,
        "title": info.get("title"),
        "artist": info.get("uploader") or info.get("artist") or "YouTube Music",
        "duration": info.get("duration", 0),
        "audioUrl": audio_url,
        "format": info.get("ext", "m4a"),
        "bitrate": info.get("abr", 160),
        "coverUrl": info.get("thumbnail"),
        "headers": info.get("http_headers", {}),
        "expiresAt": now + CACHE_TTL_SECONDS
    }

    # Store in memory cache
    stream_cache[video_id] = result
    return result

@app.get("/api/debug/{video_id}")
async def debug_stream(video_id: str):
    import urllib.request
    try:
        # Check current public IP
        ip_res = httpx.get("https://api.ipify.org?format=json", timeout=5).json()
        current_ip = ip_res.get("ip")
    except Exception as e:
        current_ip = f"Error: {e}"

    stream_info = get_stream_url(video_id)
    audio_url = stream_info["audioUrl"]
    headers = dict(stream_info.get("headers", {}))

    # Test urllib
    urllib_result = ""
    try:
        req = urllib.request.Request(audio_url, headers={"User-Agent": headers.get("User-Agent", "")})
        with urllib.request.urlopen(req, timeout=5) as r:
            sample = r.read(64)
            urllib_result = f"OK: {len(sample)} bytes, HTTP {r.status}"
    except Exception as e:
        urllib_result = f"Err: {e}"

    # Test httpx
    httpx_result = ""
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(audio_url, headers=headers)
            httpx_result = f"HTTP {resp.status_code}, length={len(resp.content)}"
    except Exception as e:
        httpx_result = f"Err: {e}"

    return {
        "current_egress_ip": current_ip,
        "video_id": video_id,
        "format": stream_info.get("format"),
        "headers": headers,
        "audio_url_snippet": audio_url[:120],
        "urllib_result": urllib_result,
        "httpx_result": httpx_result,
    }

@app.api_route("/api/proxy/{video_id}", methods=["GET", "HEAD"])
async def proxy_audio_stream(video_id: str, request: Request):
    """
    Direct audio stream proxy. Supports HTTP Range requests for seeking in expo-audio.
    Use this endpoint if direct googlevideo streaming is blocked on client network.
    """
    stream_info = get_stream_url(video_id)
    audio_url = stream_info["audioUrl"]

    # Forward only clean User-Agent and Range header
    headers = {
        "User-Agent": stream_info.get("headers", {}).get(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        )
    }
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    try:
        upstream_req = client.build_request(request.method, audio_url, headers=headers)
        upstream_res = await client.send(upstream_req, stream=True)
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Upstream stream error: {str(e)}")

    response_headers = {
        "Content-Type": upstream_res.headers.get("Content-Type", "audio/mp4"),
        "Accept-Ranges": "bytes",
    }
    if "Content-Length" in upstream_res.headers:
        response_headers["Content-Length"] = upstream_res.headers["Content-Length"]
    if "Content-Range" in upstream_res.headers:
        response_headers["Content-Range"] = upstream_res.headers["Content-Range"]

    if request.method == "HEAD":
        await upstream_res.aclose()
        await client.aclose()
        return Response(status_code=upstream_res.status_code, headers=response_headers)

    async def stream_generator():
        try:
            async for chunk in upstream_res.aiter_bytes():
                yield chunk
        finally:
            await upstream_res.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        status_code=upstream_res.status_code,
        headers=response_headers,
    )

@app.get("/api/trending")
def get_trending(country: str = Query("IN", description="Two letter country code, e.g. IN, US")):
    """
    Get top trending songs from YouTube Music charts.
    Defaults to IN (India).
    """
    try:
        charts = ytm.get_charts(country=country)
        tracks = charts.get("videos", {}).get("items", []) or charts.get("tracks", {}).get("items", [])
    except Exception as e:
        # Fallback to search popular Bollywood/trending if charts fail
        try:
            return search_songs(q="Trending Hindi Songs 2026")
        except:
            raise HTTPException(status_code=500, detail=f"Trending fetch failed: {str(e)}")

    songs = []
    for item in tracks:
        video_id = item.get("videoId")
        if not video_id:
            continue
        artists = [a.get("name", "") for a in item.get("artists", []) if a.get("name")]
        artist_str = ", ".join(artists) if artists else "Trending Artist"

        songs.append({
            "id": video_id,
            "title": item.get("title", "Unknown Title"),
            "artist": artist_str,
            "album": "Trending Chart",
            "duration": parse_duration(item.get("duration", "0:00")),
            "coverUrl": clean_thumbnail(item.get("thumbnails", [])),
            "source": "youtube"
        })

    return {"country": country, "count": len(songs), "songs": songs}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
