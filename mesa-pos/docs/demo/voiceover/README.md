# How to make the Isarva POS video with this voiceover

You already have AI intro/end videos + voice tracks. Record the screen for the middle, then assemble.

## Product advertisement (use this)

| File | What |
|------|------|
| **`isarva-AD.mp4`** | Clear ~40s product ad — simple language, men-only scenes, English voice |

Open that file to share or post as your Isarva POS advertisement.

## Full AI demo (no recording needed)

| File | What |
|------|------|
| **`isarva-demo-AI-FULL.mp4`** | Complete ~44s promo: AI intro + scenes + end + English voice |

Open that file and play it — ready to share.

## Ready-to-use video pieces (order)

| # | File | Role |
|---|------|------|
| 1 | `01-intro.mp4` | AI opening (7s zoom + fade) |
| 1b | `01-intro-with-voice.mp4` | Same intro + English teaser voice |
| 2 | `02-middle-REPLACE-ME.mp4` | Placeholder — **replace with your screen recording** |
| 3 | `03-end.mp4` | AI end card video (6s) |
| — | `isarva-demo-TEMPLATE.mp4` | Preview sandwich (intro + placeholder + end) |

Also: `isarva-ai-intro.png` / `isarva-ai-end.png` (stills), voice MP3s, scripts.

## Fastest path (CapCut / Clipchamp)

1. Open CapCut or Clipchamp  
2. Add clips in this order:
   - `01-intro.mp4`
   - **your** `Win+Alt+R` screen recording
   - `03-end.mp4`
3. Drop `isarva-demo-en-full.mp3` on the audio track  
4. Trim middle shots to match the voice  
5. Export **MP4 1080p**

## Auto-assemble with FFmpeg (after you record)

```powershell
cd d:\ZKTeco\mesa-pos\docs\demo\voiceover
.\assemble_demo.ps1 -MiddleVideo "C:\Users\ISARVA\Videos\Captures\YOUR-CAPTURE.mp4" -VoiceMp3 ".\isarva-demo-en-full.mp3"
```

Output: `isarva-demo-FINAL.mp4`

## Record the middle (POS)

1. Open https://app.restaurant-pos.isarva.in as Admin  
2. Press **Win + Alt + R**  
3. Follow `../ISARVA-DEMO-001-Video-Recording-Checklist.md`  
4. Stop recording → file in `Videos/Captures`

## What to show in the middle while voice plays

1. Home KPIs + Live now  
2. Dine-in → table → add items → KOT  
3. Settle / SoftPOS  
4. Quick Serve  
5. Kitchen Display  
6. Delivery board + rider  
7. Home Live now again  

## Voice files

| File | Use |
|------|-----|
| `isarva-demo-en-full.mp3` | Full English narration |
| `isarva-demo-en-teaser.mp3` | Short teaser |
| `isarva-demo-ar-full.mp3` | Full Arabic |

Preview structure: open `isarva-demo-TEMPLATE.mp4`.
