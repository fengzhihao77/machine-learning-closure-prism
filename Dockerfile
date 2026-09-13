# The scientific requirements and protected engine are copied without modification.
ARG PYTHON_IMAGE=python:3.9.23-slim-bookworm@sha256:7bffea15bcc3d7fb87cf10a027986203e4281e078fa2f5b234c30fca291f0834
FROM ${PYTHON_IMAGE} AS dependencies

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    BOKEH_IN_DOCKER=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    VECLIB_MAXIMUM_THREADS=1 \
    TF_NUM_INTRAOP_THREADS=1 \
    TF_NUM_INTEROP_THREADS=1 \
    TF_CPP_MIN_LOG_LEVEL=2

# Install browser and driver from the same distribution repository.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-driver libgomp1 ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/ml-closure
COPY requirements.txt ./requirements.txt
COPY deploy/constraints-reference-common.txt ./deploy/constraints-reference-common.txt
RUN python -m pip install --no-cache-dir -r requirements.txt -c deploy/constraints-reference-common.txt \
    && python -m pip check
RUN ln -s /usr/bin/chromium /usr/local/bin/google-chrome

FROM dependencies AS application
RUN useradd --create-home --uid 1000 mlclosure
RUN mkdir -p /home/mlclosure/.cache/selenium \
    && printf 'browser-path = "/usr/bin/chromium"\noffline = true\navoid-browser-download = true\n' > /home/mlclosure/.cache/selenium/se-config.toml \
    && chown -R 1000:1000 /home/mlclosure/.cache
COPY run.py ./run.py
COPY ml_closure_models/ ./ml_closure_models/
COPY templates/ ./templates/
COPY static/ ./static/
USER 1000:1000
ENV HOST=0.0.0.0 PORT=7860
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','7860')+'/',timeout=4).read(1)"
CMD ["python", "run.py"]
