# GPU server running SAM 3D Body for ErgoCapture.
#   docker build -t ergocapture-sam3d .
#   docker run --gpus all -p 8000:8000 -e HF_TOKEN=hf_... \
#     -e ERGOCAPTURE_ORIGINS=https://your-app.vercel.app -e ERGOCAPTURE_TOKEN=change-me ergocapture-sam3d
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel

ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# SAM 3D Body (SAM License) and its dependencies, per its INSTALL.md
RUN git clone --depth 1 https://github.com/facebookresearch/sam-3d-body.git /opt/sam-3d-body
RUN pip install pytorch-lightning pyrender opencv-python-headless yacs scikit-image einops timm dill pandas rich \
      hydra-core hydra-submitit-launcher hydra-colorlog pyrootutils webdataset chump networkx==3.2.1 roma joblib \
      seaborn appdirs ffmpeg cython jsonlines xtcocotools loguru optree fvcore pycocotools huggingface_hub \
 && pip install 'git+https://github.com/facebookresearch/detectron2.git@a1ce2f9' --no-build-isolation --no-deps

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY ergocapture_sam3d.py app.py cli.py ./

ENV PYTHONPATH=/opt/sam-3d-body:/app
WORKDIR /opt/sam-3d-body
EXPOSE 8000
CMD ["uvicorn", "app:app", "--app-dir", "/app", "--host", "0.0.0.0", "--port", "8000"]
