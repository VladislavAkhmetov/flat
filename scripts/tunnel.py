import os
import sys
import time
import subprocess
import re
import threading

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUDFLARED = os.path.join(PROJECT_ROOT, "scripts", "bin", "cloudflared.exe")

def run_tunnel(name, port, result_dict):
    cmd = [CLOUDFLARED, "tunnel", "--url", f"http://127.0.0.1:{port}"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, encoding="utf-8", errors="replace")
    
    url_found = False
    for line in proc.stdout:
        line_clean = line.strip()
        # Look for trycloudflare.com URL
        match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line_clean)
        if match and not url_found:
            tunnel_url = match.group(0)
            result_dict[name] = tunnel_url
            url_found = True
            print(f"[{name}] Tunnel established: {tunnel_url}", flush=True)

if __name__ == "__main__":
    if not os.path.exists(CLOUDFLARED):
        print(f"Error: {CLOUDFLARED} not found.")
        sys.exit(1)

    tunnels = {}
    t_api = threading.Thread(target=run_tunnel, args=("API", 3100, tunnels), daemon=True)
    t_ai = threading.Thread(target=run_tunnel, args=("AI", 5000, tunnels), daemon=True)

    t_api.start()
    t_ai.start()

    # Wait until both URLs are found or 30s timeout
    start_time = time.time()
    while len(tunnels) < 2 and time.time() - start_time < 30:
        time.sleep(0.5)

    if len(tunnels) == 2:
        print("\n" + "="*60)
        print("  FIGMA CODE CONFIGURATION:")
        print("="*60)
        print(f"VITE_API_URL={tunnels['API']}/api")
        print(f"VITE_AI_URL={tunnels['AI']}")
        print("="*60 + "\n")
        
        # Save to a file for easy reading
        env_figma = os.path.join(PROJECT_ROOT, ".env.figma")
        with open(env_figma, "w", encoding="utf-8") as f:
            f.write(f"VITE_API_URL={tunnels['API']}/api\n")
            f.write(f"VITE_AI_URL={tunnels['AI']}\n")
        print(f"Saved to {env_figma}")
    else:
        print("Timeout waiting for tunnels to establish. Check logs above.")

    # Keep alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down tunnels...")
