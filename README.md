<h1 align="center">Airline Operations Data Pipeline</h1>

<p align="center">
  <strong>An automated ELT data pipeline that ingests airline operations CSV files into Snowflake,<br>transforms them with dbt, orchestrates everything with Apache Airflow,<br>and serves insights through a visualization layer.</strong>
</p>

<p align="center">
  <sub>Built and maintained by <a href="https://github.com/haleduoc">haleduoc</a></sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/Apache%20Airflow-3.3.2-017CEE?style=for-the-badge&logo=apacheairflow&logoColor=white" alt="Apache Airflow">
  <img src="https://img.shields.io/badge/dbt-2.0.9-FF694B?style=for-the-badge&logo=dbt&logoColor=white" alt="dbt">
  <img src="https://img.shields.io/badge/Snowflake-Data_Warehouse-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white" alt="Snowflake">
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Architecture-Decoupled_ELT-teal?style=flat-square" alt="Decoupled ELT Architecture">
  <img src="https://img.shields.io/badge/Trigger-Event_Driven-orange?style=flat-square" alt="Event-driven trigger">
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#key-highlights">Highlights</a> ·
  <a href="#pipeline-stages">Stages</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#project-structure">Project Structure</a>
</p>

---

## Overview

This project implements a complete **ELT Data Pipeline** for airline operations analytics. Raw CSV files dropped into a landing folder are detected automatically, bulk-loaded into Snowflake as-is, transformed into analytics-ready models with dbt, and orchestrated end to end by a Dockerized Apache Airflow stack. Results are served through a dedicated visualization layer.

<!-- TODO: add 1-2 sentences about the dataset (source, time range, main entities such as flights, delays, cancellations, airports). -->

---

## Architecture

```
┌──────────────────────┐
│  Raw CSV Files       │  (data/Raw)
└──────┬───────────────┘
       │ [Auto-Trigger] Watches the folder, waits until files are stable,
       │                then triggers the Airflow DAG
       ▼
┌──────────────────────┐
│  Ingestion (Python)  │  [Stage 1: Ingest] snowflake-connector-python
└──────┬───────────────┘
       │ Serialized writes (Airflow pool: airline_ops_snowflake_write)
       ▼
┌──────────────────────┐
│  Snowflake           │  (Raw table, configured via SNOWFLAKE_RAW_TABLE)
└──────┬───────────────┘
       │ [Stage 2: Transform] dbt (models + macros + packages)
       ▼
┌──────────────────────┐
│  Snowflake (dbt)     │  (Analytics-ready models in DBT_SCHEMA)
└──────┬───────────────┘
       │ [Stage 3: Data Quality] dbt tests
       ▼
┌──────────────────────┐
│  Visualization       │  [Stage 4: Serve]
└──────────────────────┘

       ▲
       │ [Orchestration] Apache Airflow 3 (LocalExecutor, Dockerized)
       │ Airflow metadata lives in a local PostgreSQL container
```

---

## Key Highlights

- **Decoupled Architecture:** Airflow metadata runs on a local Docker PostgreSQL instance, while business data is isolated in Snowflake.
- **Event-Driven Triggering:** A lightweight `auto_trigger` service polls `data/Raw` and starts the DAG only after new CSV files have been stable for a configurable window, so half-copied files are never ingested.
- **Safe Snowflake Writes:** A dedicated Airflow pool (`airline_ops_snowflake_write`, 1 slot) serializes ingestion writes and prevents concurrent loads from colliding.
- **ELT with dbt:** Raw data is preserved as-is in Snowflake; all cleaning and modeling is done in dbt with versioned models, macros, and locked packages (`package-lock.yml`).
- **Reproducible Builds:** Airflow is installed against the official constraints file, dbt runs in its own virtual environment inside the image, and `pip check` runs at build time to catch dependency conflicts.
- **Zero Hardcoded Secrets:** All credentials come from ignored `.env` files; Compose refuses to start if required secrets are missing.
- **Locked-Down Runtime:** The Airflow UI binds to `127.0.0.1` only, and source code and data are mounted read-only into containers.

---

## Pipeline Stages

- **Stage 1 — Ingest (Snowflake):** Reads raw CSV files from `data/Raw` and loads them into the Snowflake raw table using `snowflake-connector-python`.
- **Stage 2 — Transform (dbt):** Cleans and models the raw records into analytics-ready tables in the schema defined by `DBT_SCHEMA`.
- **Stage 3 — Data Quality (dbt tests):** Validates the transformed models before they are consumed downstream.
- **Stage 4 — Visualization:** Serves the final models to end users.
  <!-- TODO: name the tool (Streamlit / Metabase / Power BI ...) and list the main charts/KPIs. -->
- **Orchestration (Airflow):** A Dockerized Airflow 3 stack (API server, DAG processor, scheduler) coordinates the DAG; the auto-trigger service starts it when new data arrives.
  <!-- TODO: add the DAG id and task order, e.g. ingest >> dbt_run >> dbt_test. -->

---

## Quickstart

### 1. Setup Environment

```bash
git clone https://github.com/haleduoc/airline-ops-pipeline.git
cd airline-ops-pipeline
```

### 2. Configure Credentials

```bash
cp .env.example .env
```

Fill in the Snowflake variables (`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`, `SNOWFLAKE_RAW_TABLE`, `DBT_SCHEMA`) and generate random values for `AIRFLOW_DB_PASSWORD`, `AIRFLOW_API_JWT_SECRET`, and `AIRFLOW_API_SECRET_KEY`.

Then create `airflow/.env` and set the Airflow UI password:

```bash
echo "AIRFLOW_UI_PASSWORD=<choose-a-password>" > airflow/.env
```

### 3. Start Airflow

```bash
docker compose up -d --build
```
- Open the Airflow Web UI at `http://localhost:8080` and sign in as `admin`.

### 4. Run the Pipeline

Drop one or more CSV files into `data/Raw/`. After the files are stable, the auto-trigger service starts the DAG automatically. You can also trigger it manually from the Airflow UI.

### 5. Launch the Visualization Layer

<!-- TODO: add the command to start the dashboard, and the URL. -->

---

## Project Structure

```text
airline-ops-pipeline/
├── airflow/
│   ├── dags/                    # Airflow DAG definitions
│   └── auto_trigger.py          # Watches data/Raw and triggers the DAG
├── ingestion/                   # CSV -> Snowflake ingestion scripts
├── Transformation/
│   ├── dbt_project.yml          # dbt project configuration
│   ├── packages.yml             # dbt package dependencies
│   ├── package-lock.yml         # Locked dbt package versions
│   ├── profiles.yml             # dbt connection profile
│   ├── macros/                  # Reusable dbt macros
│   └── models/                  # dbt models
├── sql/                         # Supporting SQL scripts
├── tests/                       # Automated tests
├── visualization/               # Visualization layer
├── docs/                        # Project documentation
├── data/
│   └── Raw/                     # CSV landing zone
├── .env.example                 # Environment variables template
├── .dockerignore                # Docker ignore configuration
├── .gitignore                   # Git ignore configuration
├── Dockerfile                   # Custom Airflow image (Airflow 3.3.2 + dbt 2.0.9)
├── compose.yaml                 # Airflow + PostgreSQL multi-container setup
└── requirements-airflow.txt     # Python dependencies for the Airflow image
```

---
