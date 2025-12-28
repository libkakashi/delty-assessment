env "prod" {
  src = [
    "file://src/server/db/schema.hcl",
  ]
  url = getenv("DATABASE_URL")

  migration {
    dir = "file://src/db/migrations"
  }
  schemas = ["public"]
}
