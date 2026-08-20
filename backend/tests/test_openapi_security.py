from main import app


def openapi_schema():
    app.openapi_schema = None
    return app.openapi()


def security_scheme_names(schema):
    schemes = (
        schema
        .get("components", {})
        .get("securitySchemes", {})
    )

    return [
        name
        for name, value in schemes.items()
        if (
            value.get("type") == "http"
            and value.get("scheme") == "bearer"
        )
    ]


def operation_security(schema, path, method):
    return (
        schema["paths"][path][method]
        .get("security")
    )


def assert_protected(schema, path, method):
    bearer_names = security_scheme_names(schema)
    security = operation_security(
        schema,
        path,
        method,
    )

    assert bearer_names
    assert security
    assert any(
        name in requirement
        for requirement in security
        for name in bearer_names
    )


def assert_public(schema, path, method):
    assert (
        operation_security(
            schema,
            path,
            method,
        )
        in (None, [])
    )


def test_openapi_defines_http_bearer_security_scheme():
    schema = openapi_schema()
    schemes = (
        schema
        .get("components", {})
        .get("securitySchemes", {})
    )

    assert schemes
    assert security_scheme_names(schema)


def test_openapi_marks_authenticated_operations_as_protected():
    schema = openapi_schema()

    assert_protected(schema, "/api/v1/me", "get")
    assert_protected(schema, "/api/v1/workouts", "get")
    assert_protected(schema, "/api/v1/routines", "get")
    assert_protected(
        schema,
        "/api/v1/admin/access-requests",
        "get",
    )


def test_openapi_leaves_public_operations_unprotected():
    schema = openapi_schema()

    assert_public(schema, "/health", "get")
    assert_public(schema, "/api/v1/health", "get")
    assert_public(
        schema,
        "/api/v1/exercises/resolve",
        "post",
    )
