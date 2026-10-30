ARG AIRFLOW_VERSION=3.3.2
ARG PYTHON_VERSION=3.12
ARG DBT_VERSION=2.0.9
FROM apache/airflow:${AIRFLOW_VERSION}-python3.12

ARG AIRFLOW_VERSION=3.3.2
ARG PYTHON_VERSION=3.12
ARG DBT_VERSION=2.0.9
ARG AIRFLOW_CONSTRAINTS_URL=https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt

USER airflow
WORKDIR /workspace

COPY --chown=airflow:root requirements-airflow.txt /tmp/requirements-airflow.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" --constraint "${AIRFLOW_CONSTRAINTS_URL}" \
    && pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements-airflow.txt \
    && pip check \
    && python -c "import snowflake.connector; import dotenv; from airflow.providers.standard.operators.bash import BashOperator"

RUN python -m venv /home/airflow/dbt-venv \
    && /home/airflow/dbt-venv/bin/pip install --no-cache-dir "dbt==${DBT_VERSION}" \
    && /home/airflow/dbt-venv/bin/pip check \
    && /home/airflow/dbt-venv/bin/dbt --version

COPY --chown=airflow:root Transformation/dbt_project.yml Transformation/packages.yml Transformation/package-lock.yml /workspace/Transformation/
WORKDIR /workspace/Transformation
RUN /home/airflow/dbt-venv/bin/dbt deps \
    && mkdir -p target logs \
    && chown -R airflow:root target logs

WORKDIR /workspace
