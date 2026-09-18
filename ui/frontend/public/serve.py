"""
Leonex Tender - Local Development Server (No Cache)
Run this instead of 'python -m http.server' to prevent the browser from caching old JS files.
"""
import http.server
import socketserver
import os

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force the browser to NEVER cache any file served by this script
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == '__main__':
    PORT = 8080
    # Ensure we serve from the frontend directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Allow port reuse in case it was just closed
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
        print("=========================================================")
        print(f"🚀 Serving FRONTEND at http://localhost:{PORT}")
        print("🛑 BROWSER CACHING IS DISABLED (Files will always be fresh)")
        print("=========================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
