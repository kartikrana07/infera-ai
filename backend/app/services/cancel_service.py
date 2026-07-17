cancelled_requests: set[str] = set()


def cancel_request(request_id: str | None):
    if request_id:
        cancelled_requests.add(request_id)


def is_cancelled(request_id: str | None):
    return bool(request_id and request_id in cancelled_requests)


def clear_cancelled(request_id: str | None):
    if request_id:
        cancelled_requests.discard(request_id)
