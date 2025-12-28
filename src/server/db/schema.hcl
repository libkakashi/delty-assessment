schema "public" {
}

table "users" {
  schema = schema.public
  column "id" {
    type = varchar(255)
  }
  column "name" {
    type = varchar(255)
  }
  column "created_at" {
    type = timestamp
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
}

table "chats" {
  schema = schema.public
  column "id" {
    type = serial
  }
  column "user_id" {
    type = varchar(255)
  }
  column "title" {
    type = varchar(255)
    null = true
  }
  column "created_at" {
    type = timestamp
    default = sql("CURRENT_TIMESTAMP")
  }
  column "updated_at" {
    type = timestamp
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
}

table "chat_messages" {
  schema = schema.public
  column "id" {
    type = serial
  }
  column "chat_id" {
    type = int
  }
  column "role" {
    type = varchar(50)
  }
  column "content" {
    type = text
  }
  column "created_at" {
    type = timestamp
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
}

table "documents" {
  schema = schema.public
  column "id" {
    type = serial
  }
  column "user_id" {
    type = varchar(255)
  }
  column "title" {
    type = varchar(255)
  }
  column "content" {
    type = text
  }
  column "created_at" {
    type = timestamp
    default = sql("CURRENT_TIMESTAMP")
  }
  column "updated_at" {
    type = timestamp
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
}
