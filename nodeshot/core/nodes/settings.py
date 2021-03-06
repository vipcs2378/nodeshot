from django.conf import settings

PUBLISHED_DEFAULT = getattr(settings, 'NODESHOT_NODES_PUBLISHED_DEFAULT', True)
HSTORE_SCHEMA = getattr(settings, 'NODESHOT_NODES_HSTORE_SCHEMA', None)
REVERSION_ENABLED = getattr(settings, 'NODESHOT_NODES_REVERSION_ENABLED', True)
DESCRIPTION_HTML = getattr(settings, 'NODESHOT_NODES_HTML_DESCRIPTION', True)


if HSTORE_SCHEMA:
    ADDITIONAL_NODE_FIELDS = [field.get('name') for field in HSTORE_SCHEMA]
else:
    ADDITIONAL_NODE_FIELDS = []
