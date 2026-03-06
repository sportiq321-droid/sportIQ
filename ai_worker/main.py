from fastapi import FastAPI, UploadFile, File, HTTPException
import cv2
import numpy as np
from ultralytics import YOLO
import tempfile
import os
import traceback

# Initialize FastAPI app and load the AI model once at startup
app = FastAPI()

print("--- AI Worker: Loading YOLOv8-Pose model... ---")
model = YOLO('yolov8n-pose.pt')
print("--- AI Worker: Model loaded successfully. ---")


# Helper function to calculate angle
def calculate_angle(p1, p2, p3):
    a = np.array(p1) # First
    b = np.array(p2) # Mid
    c = np.array(p3) # End
    radians = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
    angle = np.abs(radians*180.0/np.pi)
    if angle > 180.0:
        angle = 360 - angle
    return angle

# Add a root endpoint for health checks
@app.get("/")
def read_root():
    return {"status": "AI worker is running"}

@app.post("/analyze/situp")
async def analyze_situp_video(file: UploadFile = File(...)):
    print(f"\n--- Received request to analyze file: {file.filename} ---")
    
    if not file.content_type or not file.content_type.startswith('video/'):
        print(f"ERROR: Invalid content type: {file.content_type}")
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}. Please upload a video.")

    # Save the uploaded video to a temporary file
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
            content = await file.read()
            temp_video.write(content)
            video_path = temp_video.name
        print(f"Video saved temporarily to: {video_path}")
    except Exception as e:
        print(f"ERROR: Failed to save temporary file. {e}")
        raise HTTPException(status_code=500, detail="Failed to save temporary video file.")

    try:
        print("Opening video file with OpenCV...")
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print("ERROR: OpenCV could not open the video file.")
            raise HTTPException(status_code=500, detail="Could not open video file.")
        
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"Video opened successfully. Total frames: {frame_count}")

        # Rep counting logic
        reps = 0
        phase = "down"
        down_threshold = 150
        up_threshold = 100
        frame_num = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("End of video stream.")
                break
            
            frame_num += 1
            # Run YOLOv8-Pose model on the frame
            results = model(frame, verbose=False)

            try:
                # Get keypoints for the first detected person
                keypoints = results[0].keypoints.xy[0].cpu().numpy()

                # COCO keypoint indices
                left_shoulder = keypoints[5]
                left_hip = keypoints[11]
                left_knee = keypoints[13]

                # Calculate hip angle
                hip_angle = calculate_angle(left_shoulder, left_hip, left_knee)

                # Hysteresis-based rep counting
                if phase == "down" and hip_angle < up_threshold:
                    phase = "up"
                elif phase == "up" and hip_angle > down_threshold:
                    reps += 1
                    phase = "down"
                    print(f"Rep counted: {reps} at frame {frame_num}")

            except Exception:
                # This is okay, it just means no person was detected in this frame.
                # print(f"No pose detected in frame {frame_num}")
                continue

        cap.release()
        print(f"--- Analysis complete. Final rep count: {reps} ---")
        
        # Return the final count
        return {"reps": reps, "status": "completed"}

    except Exception as e:
        print("\n!!! UNEXPECTED ERROR DURING ANALYSIS !!!")
        traceback.print_exc() # Print detailed error traceback
        raise HTTPException(status_code=500, detail=f"An internal error occurred during analysis: {e}")

    finally:
        # Clean up the temporary file
        if os.path.exists(video_path):
            os.unlink(video_path)
            print(f"Temporary file cleaned up: {video_path}")