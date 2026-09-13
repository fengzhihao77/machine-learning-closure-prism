"""Open the Predictor inside an individual Binder session."""
import os
from pathlib import Path
import re

from jupyter_server_proxy.config import ServerProcess

source_root = Path(os.environ["ML_CLOSURE_SOURCE_ROOT"]).resolve()
science_python = Path.home() / ".venvs/ml-closure-py39/bin/python"
browser_bin = Path.home() / ".local/ml-closure-browser/bin"


class PredictorServerProcess(ServerProcess):
    """Stream prediction HTML through this named proxy only.

    The pinned proxy otherwise buffers HTML until completion. Reuse its
    native streaming path so the engine adapter's response comments reach
    the visitor during a long calculation. Authentication and supervision
    remain inherited from Jupyter Server Proxy.
    """

    def make_proxy_handler(self):
        parent_handler, kwargs = super().make_proxy_handler()
        if parent_handler is None:
            return parent_handler, kwargs

        class PredictorHandler(parent_handler):
            async def _proxy_buffered(self, host, port, proxied_path, body, client):
                if (self.request.method == "POST"
                        and re.fullmatch(r"/api/runs/[A-Za-z0-9_-]{43}/predict", proxied_path)):
                    return await self._proxy_progressive(host, port, proxied_path, body, client)
                return await super()._proxy_buffered(host, port, proxied_path, body, client)

        return PredictorHandler, kwargs


def predictor_environment(base_url):
    return {
        "HOST": "127.0.0.1",
        "PORT": "{port}",
        "ML_CLOSURE_SERVER": "waitress",
        "ML_CLOSURE_BASE_URL": base_url.rstrip("/") + "/predictor/",
        "PATH": str(browser_bin) + os.pathsep + os.environ["PATH"],
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONNOUSERSITE": "1",
        "PYTHONUNBUFFERED": "1",
        "BOKEH_IN_DOCKER": "1",
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "VECLIB_MAXIMUM_THREADS": "1",
        "TF_NUM_INTRAOP_THREADS": "1",
        "TF_NUM_INTEROP_THREADS": "1",
        "TF_CPP_MIN_LOG_LEVEL": "2",
    }


c.ServerProxy.servers = {
    "predictor": PredictorServerProcess(
        name="predictor",
        command=[str(science_python), str(source_root / "run.py")],
        environment=predictor_environment,
        timeout=180,
        absolute_url=False,
        launcher_entry={"title": "ML Closure Predictor"},
    )
}
