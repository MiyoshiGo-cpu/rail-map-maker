# 開発用のローカルサーバー。python -m http.server と同じだが、ブラウザにキャッシュさせない
# （編集したファイルが再読み込みですぐ反映されるように）。
# 使い方：py tools/serve.py        （ポートを変えるなら py tools/serve.py 8080）
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.webmanifest': 'application/manifest+json',
        '.json': 'application/json',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'http://localhost:{PORT}/ で配信中（止めるには Ctrl+C）')
        httpd.serve_forever()
