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
        "version": "1.0.4",
        "commit": "hybrid-streaming-mirrors",
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
            audio_url = info.get("url")
            headers = info.get("http_headers", {})
    except Exception:
        # Fallback to direct high-speed audio stream mirror
        audio_url = f"https://yt.chocolatemoo53.com/latest_version?id={video_id}&itag=140&local=true"
        headers = {"User-Agent": "Mozilla/5.0"}
        info = {}

    result = {
        "id": video_id,
        "title": info.get("title") or "YouTube Music Track",
        "artist": info.get("uploader") or info.get("artist") or "YouTube Music",
        "duration": info.get("duration", 0),
        "audioUrl": audio_url,
        "format": info.get("ext", "m4a"),
        "bitrate": info.get("abr", 160),
        "coverUrl": info.get("thumbnail"),
        "headers": headers,
        "expiresAt": now + CACHE_TTL_SECONDS
    }

    # Store in memory cache
    stream_cache[video_id] = result
    return result

@app.get("/api/debug/{video_id}")
async def debug_stream(video_id: str):
    import urllib.request
    results = {}

    # Test 1: Invidious
    for inst in ["https://yt.chocolatemoo53.com", "https://inv.nadeko.net", "https://invidious.nerdvpn.de"]:
        try:
            url = f"{inst}/latest_version?id={video_id}&itag=140&local=true"
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
                r = await client.get(url, headers={"Range": "bytes=0-100"})
                results[f"invidious_{inst}"] = f"HTTP {r.status_code}, len={len(r.content)}"
        except Exception as e:
            results[f"invidious_{inst}"] = f"Err: {e}"

    # Test 2: yt-dlp different clients
    clients_to_test = [
        ("default", None),
        ("tv_embedded", ["tv_embedded"]),
        ("visionos", ["visionos"]),
        ("mweb", ["mweb"]),
        ("ios", ["ios"]),
    ]

    for name, p_client in clients_to_test:
        opts: Dict[str, Any] = {
            "format": "140/ba/b",
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "remote_components": ["ejs:github"],
        }
        if p_client:
            opts["extractor_args"] = {"youtube": {"player_client": p_client}}
        if HAS_IMPERSONATE:
            try:
                opts["impersonate"] = ImpersonateTarget.from_str("chrome")
            except Exception:
                pass
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                results[f"ytdlp_{name}"] = f"OK: {info.get('format_id')}, url_len={len(info.get('url', ''))}"
        except Exception as e:
            results[f"ytdlp_{name}"] = f"Err: {str(e)[:100]}"

    return results

@app.api_route("/api/proxy/{video_id}", methods=["GET", "HEAD"])
async def proxy_audio_stream(video_id: str, request: Request):
    """
    Direct audio stream proxy. Supports HTTP Range requests for seeking in expo-audio.
    Combines high-speed audio mirror with yt-dlp fallback.
    """
    range_header = request.headers.get("Range")
    req_headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    if range_header:
        req_headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=25.0, follow_redirects=True)
    upstream_res = None

    # 1. Try Invidious mirror (itag 140 m4a / 251 opus)
    mirrors = [
        f"https://yt.chocolatemoo53.com/latest_version?id={video_id}&itag=140&local=true",
        f"https://yt.chocolatemoo53.com/latest_version?id={video_id}&itag=251&local=true",
    ]
    for m_url in mirrors:
        try:
            req = client.build_request("GET", m_url, headers=req_headers)
            res = await client.send(req, stream=True)
            if res.status_code in (200, 206):
                upstream_res = res
                break
            else:
                await res.aclose()
        except Exception:
            continue

    # 2. Try yt-dlp stream if mirrors fail
    if not upstream_res:
        try:
            stream_info = get_stream_url(video_id)
            audio_url = stream_info["audioUrl"]
            ydl_headers = {"User-Agent": stream_info.get("headers", {}).get("User-Agent", "Mozilla/5.0")}
            if range_header:
                ydl_headers["Range"] = range_header
            req = client.build_request("GET", audio_url, headers=ydl_headers)
            res = await client.send(req, stream=True)
            if res.status_code in (200, 206):
                upstream_res = res
            else:
                await res.aclose()
        except Exception:
            pass

    if not upstream_res:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Audio stream currently unavailable.")

    response_headers = {
        "Content-Type": upstream_res.headers.get("Content-Type", "audio/mp4"),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
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
