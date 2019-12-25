# Node JS PostgreSQL Helper (both callback & async/await are supported)

- Use with Node Postgres: <https://github.com/brianc/node-postgres>

## Documentation

`var db = require("db_utils")`

### Some basic commands

#### Select

- Syntax:

```
db.select("TABLE_NAME", "RETURNED_COLUMNS", CONDITION_PARAMS) // return -> array
```

- Example:

```
var rows = await db.select("users", "*", {
  skip: 1,
  limit: 2,
  orderBy: "created_date",
  order: "desc",
  where: [
    {col: "first_name", val: "John"}, // WHERE first_name='John'
    {col: "last_name", val: "Wick"}, // AND last_name='Wick'
    {col: "age", op: ">", val: 32}, // AND age>32
    {type: "or", col: "gender", val: "male"} // OR gender='male'
  ],
  extra: "GROUP BY dog"
})

console.log(rows) // [ { id: 2, first_name: "John", last_name: "Wick", age: 40, gender: male} ]
```

- Using `LIKE` syntax:

```
db.select("users", "*", {
  where: { col: "name", op: "like", val: "John" }
}).then(rows => {
  console.log(rows)
}).catch(err => {
  console.log(err)
})
```

- Using `JOIN` syntax: 
Join pattern: `from_table_column_name->matched_to_table_column_name(of_table_name){returned_columns}`
(*TODO: `LEFT JOIN` and `RIGHT JOIN`)

```
// SELECT users.id, users.first_name, users.last_name, dogs.name, dogs.breed FROM users
// INNER JOIN dogs ON users.dog_id=dogs.id
// WHERE name LIKE '%John%'
// LIMIT 1
db.select("users", "id, first_name, last_name, dog_id->id(dogs){name, breed}", { limit: 1, where: {col: "name", op: "like", val:"%John%"} }).then(rows => {
  console.log(rows[0])
  // { id: 1, first_name: "John", last_name: "Wick", dogs_name: "Puppy", dogs_breed: "Pug" }
}).catch(err => {
  console.log(err)
})

```

#### Count

- Syntax:

```
db.count("TABLE_NAME", "COLUMNS", CONDITION_PARAMS) // return -> array
```

- Example:

```
db.count("users", "*", {
  where: { col: "age", op: ">=", val: "18" }
}).then(amount => {
  console.log(amount)
}).catch(err => {
  console.log(err)
})
```

OR

```
async function countUsers(){
  var amount = await db.count("users", "*", { where: { col: "age", op: ">=", val: "18" } })
  return amount
}
```

#### Insert

- Syntax:

```
db.insert("TABLE_NAME", ITEM_DATA_OBJECT, OPTIONAL_RETURNED_COLUMNS) // return inserted `id` as default
```

- Example:

```
// Insert a single row
db.insert("users", {
  first_name: "John",
  last_name: "Wick"
}).then(rows => {
  console.log(rows[0].id)
}).catch(err => {
  console.log(err)
})

// Insert multiple rows
db.insert("users", [
  {
    first_name: "John",
    last_name: "Wick"
  },
  {
    first_name: "Super",
    last_name: "Man"
  }
]).then(rows => {
  console.log(rows) // [ {id: 2}, {id: 3} ]
}).catch(err => {
  console.log(err)
})
```

#### Update

- Syntax:

```
db.update("TABLE_NAME", ITEM_DATA_OBJECT, CONDITION_PARAMS) // return -> array
```

- Example:

```
db.update("users", {
  first_name: "Christiano",
  last_name: "Ronaldo"
}, {
  where: { col: "id", val: 4 } 
}).then(rows => {
  console.log(rows[0].id)
}).catch(err => {
  console.log(err)
})
```

#### Delete

- Syntax:

```
db.remove("TABLE_NAME", CONDITION_PARAMS) // return boolean
```

- Example:

```
db.remove("users", {
  where: { col: "id", val: 4 } 
}).then(success => {
  console.log(success) // true
}).catch(err => {
  console.log(err)
})
```

#### Check if column existed

- Syntax:

```
db.existed("COLUMN_NAME", "TABLE_NAME") // return boolean
```

- Example:

```
var isColumnExisted = await db.existed("first_name", "users")
console.log(isColumnExisted) // true
```

### Pure query command

- Syntax:

```
db.query("QUERY_COMMAND", queryParamArray, optionalCallback)
```

- Example:

```
db.query("SELECT * FROM users WHERE id=$1", [25]).then(result => {
  console.log(result.rows)
}).catch(err => {
  console.log(err)
})
```

- Example (callback):

```
db.query("SELECT * FROM users WHERE id=$1", [25], onComplete)

function onComplete(error, result){
  if(!error){
    console.log(result.rows)
  } else {
    console.log(error)
  }
}
```

That's it!
