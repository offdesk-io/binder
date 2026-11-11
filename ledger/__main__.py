import os
import sys

import uvicorn

from .app import create_app
from .config import ConfigError, load_settings


def main() -> None:
    try:
        settings = load_settings(os.environ)
    except ConfigError as err:
        print(err, file=sys.stderr)
        sys.exit(2)
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
