from config import DATA_DIR
from storage.local import LocalFileStorage

_storage = LocalFileStorage(DATA_DIR)


def get_storage() -> LocalFileStorage:
    return _storage
