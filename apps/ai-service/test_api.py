import requests
import json
import sys

def test_process():
    url = "http://localhost:5000/process-plan"
    
    # Create a dummy white image (100x100)
    # We can't easily upload a real image without path, but let's try to verify health first
    try:
        r = requests.get("http://localhost:5000/health")
        print("Health Check:", r.json())
    except Exception as e:
        print("Server seems down:", e)
        return

    # Real image test
    image_path = "C:/Users/amazi/.gemini/antigravity/brain/b44ca7c0-4a71-4f80-8663-0f476c0a98b0/uploaded_image_1769192680801.png"
    try:
        with open(image_path, 'rb') as f:
            files = {'file': f}
            # Sending with NO threshold to encourage AI use (though my logic prioritizes AI anyway)
            r = requests.post("http://localhost:5000/process-plan", files=files)
            
            if r.status_code == 200:
                data = r.json()
                print(f"\nResponse Status: {r.status_code}")
                print(f"Method Used: {data.get('method', 'unknown')}")
                print(f"Walls Found: {len(data.get('walls', []))}")
                print(f"Furniture Found: {len(data.get('furniture', []))}")
                if data.get('furniture'):
                    print("Sample Item:", data['furniture'][0])
            else:
                 print(f"Error: {r.text}")
    except Exception as e:
        print(f"Failed to upload: {e}")

if __name__ == "__main__":
    test_process()
