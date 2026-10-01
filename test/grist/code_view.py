"""Code View text of a document, from its metadata as JSON on stdin ({"tables": ..., "columns": ...}),
using the server's own gencode.py. GRIST_SANDBOX_DIR points at <grist-core>/sandbox/grist."""
import json, os, sys

sys.path.insert(0, os.environ["GRIST_SANDBOX_DIR"])
import gencode, schema  # noqa: E402


class Table:
  def __init__(self, table_id, data):
    self.table_id = table_id
    self.row_ids = data["id"]
    self.columns = {key: values for key, values in data.items() if key != "id"}


payload = json.load(sys.stdin)
user_schema = schema.build_schema(Table("_grist_Tables", payload["tables"]), Table("_grist_Tables_column", payload["columns"]), include_builtin=False)
generator = gencode.GenCode()
generator.make_module(user_schema)
sys.stdout.write(generator.get_user_text())
