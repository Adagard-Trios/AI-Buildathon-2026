# Generic image for the FastAPI services. Build from the REPO ROOT so the shared libraries are in context:
#   docker build -f infra/docker/python-service.Dockerfile \
#     --build-arg SERVICE_DIR=backend/Fraud-Detection --build-arg APP=app:app -t fraud .
# Shared code lands at /app/shared_odata and /app/shared_auth, where the services look when not run from a checkout.
FROM python:3.12-slim
ARG SERVICE_DIR
ARG APP=app:app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 APP=${APP}
WORKDIR /app
COPY ${SERVICE_DIR}/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY ${SERVICE_DIR}/ ./
COPY shared/odata/ ./shared_odata/
COPY shared/auth/ ./shared_auth/
RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser
# Cloud Run injects PORT.
CMD ["sh", "-c", "uvicorn ${APP} --host 0.0.0.0 --port ${PORT:-8080}"]
