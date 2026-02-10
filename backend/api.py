from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import uvicorn
import numpy as np
import base64
from face_analyzer import FaceAnalyzer

app = FastAPI()

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
analyzer = None

class FrameData(BaseModel):
    image: str # Base64 encoded image string
    session_id: str = "default" # Unique ID per user tab

@app.on_event("startup")
async def startup_event():
    global analyzer
    # Initialize Analyzer
    analyzer = FaceAnalyzer()
    # We don't start the thread anymore as we use sync analysis,
    # but the thread can remain daemon for other background tasks if needed.
    print("System Started - Waiting for frames...")

@app.on_event("shutdown")
async def shutdown_event():
    global analyzer
    if analyzer:
        analyzer.stop()
    print("System Shutdown")

@app.post("/analyze")
async def analyze_frame(data: FrameData):
    global analyzer
    if analyzer is None:
        raise HTTPException(status_code=500, detail="Analyzer not initialized")

    try:
        # 1. Decode Base64 string to OpenCV Image
        header, encoded = data.image.split(",", 1) if "," in data.image else (None, data.image)
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise ValueError("Invalid image data")

        # 2. Analyze with session isolation
        results = analyzer.analyze_frame_sync(frame, session_id=data.session_id)
        
        if results and len(results) > 0:
            face = results[0]
            return {
                "detected": True,
                "dominant_emotion": face.get('dominant_emotion'),
                "emotions": face.get('emotion'),
                "region": face.get('region')
            }
        
        return {"detected": False}

    except Exception as e:
        print(f"Error processing frame: {e}")
        return {"detected": False, "error": str(e)}

@app.get("/status")
async def get_status():
    return {"status": "online", "model": "DeepFace (MediaPipe backend)"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
