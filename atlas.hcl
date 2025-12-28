env "local" {
  src = [
    "file://src/server/db/schema.hcl",
  ]
  url = "postgres://postgres:postgres@localhost:5432/delty_test?sslmode=disable"

  migration {
    dir = "file://src/db/migrations"
  }
  schemas = ["public"]
}

env "prod" {
  src = [
    "file://src/server/db/schema.hcl",
  ]
  url = "postgres://postgres:postgres@localhost:5432/delty_prod?sslmode=disable"

  migration {
    dir = "file://src/db/migrations"
  }
  schemas = ["public"]
}
