from __future__ import annotations

import os

from backend import create_app

app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.getenv("SAFEROUTE_API_HOST", "127.0.0.1"),
        port=int(os.getenv("SAFEROUTE_API_PORT", "5000")),
        debug=os.getenv("SAFEROUTE_DEBUG", "false").lower() == "true",
    )
