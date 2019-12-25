var moment = require('moment-timezone')

const Pool = require('pg').Pool
const db = new Pool()

// enable DEBUG mode
var debug = true
var timezone = "Asia/Saigon"

function setDefaultTimezone(tz){
  timezone = tz
}

function query(str, params, cb) {
  // callback(err, result)
  var queryStr = str
  var queryParams = params
  var maxQueryAttempt = 5
  var curQueryAttempt = 0

  var shouldPrintLog = debug && (queryStr.indexOf("SELECT column_name") == -1)

  if (shouldPrintLog) {
    console.log("[DB Utils] ======================")
    console.log("[DB Utils] COMMAND:", queryStr)
    console.log("[DB Utils] PARAMS:", queryParams)
  }

  return new Promise(resolve => {
    if (queryParams) {
      db.query(queryStr, queryParams, queryCallback)
    } else {
      db.query(queryStr, queryCallback)
    }

    function queryCallback(err, result) {
      if (err) {
        if (shouldPrintLog) console.log("[DB Utils] ERROR:", err.stack)
        if (err.code == 'ECONNREFUSED') {
          if (shouldPrintLog) console.log("[DB Utils] ERROR: Reconnecting... (Number of retries: " + curQueryAttempt + ")")
          curQueryAttempt++
          if (curQueryAttempt < maxQueryAttempt) {
            if (queryParams) {
              db.query(queryStr, queryParams, queryCallback)
            } else {
              db.query(queryStr, queryCallback)
            }
          } else {
            if (cb) {
              cb(err, undefined)
            } else {
              throw err
            }
          }
        } else {
          if (cb) {
            cb(err, undefined)
          } else {
            throw err
          }
        }
      } else {
        var rows = result.rows
        // convert timezone (if any)
        rows.forEach(row => {
          for(var k in row){
            if(row[k] && row[k].getMonth) row[k] = moment(row.created_at).tz(timezone).format("YYYY-MM-DD HH:mm:ss")

            // should not return "deleted_at"
            if(k == "deleted_at") delete row.deleted_at
          }
        })

        var printedRows = (result.rows.length > 2) ? [result.rows[0], result.rows[1], ".......................", "[ AND " + (result.rows.length - 2) + " MORE ITEMS... ]", "......................."] : result.rows
        if (shouldPrintLog) console.log("[DB Utils] RESULTS -> ROWS:", printedRows)
        if (cb) {
          cb(err, result)
        } else {
          resolve(result)
        }
      }
    }
  })
}

function count(table, columns, options) {
  /// columns:           Array of strings
  /// options:           {where: whereObj, skip: 2, limit: 2, orderBy: "column", order: "asc" || "desc", extra: "GROUP BY column"}
  /// options.where:     [{type: "and" || "or", col: "column", val: "value", op: "=" || "like"}]
  var colStr = ""
  if (typeof columns == "array") {
    columns.forEach(col => {
      colStr += col + ", "
    })
    if (columns.length > 0) colStr = colStr.substr(0, colStr.length - 2)
  } else if (typeof columns == "string") {
    colStr = columns
  } else {
    // throw "Param `columns` is required"
    colStr = "*"
  }

  var queryStr = "SELECT COUNT(" + colStr + ") FROM " + table
  var queryParams = []

  if (options) {
    queryStr += parseWhere(options.where, queryParams)
    // extra conditions ?
    if (options.extra) queryStr += " " + options.extra
  }

  return new Promise(resolve => {
    query(queryStr, queryParams).then((result) => {
      // console.log(result)
      resolve(parseInt(result.rows[0].count))
    }).catch((err) => {
      throw err
    })
  })
}

function countArrows(input) {
  var a = input.match(/->/g)
  return a ? a.length : 0
}

function getValsInBraces(input) {
  var output = input.match(/{(.+?)}/g)
  if (!output) output = []

  var i = 0
  output.forEach(word => {
    output[i] = word.substr(1).substr(0, word.length - 2)
    output[i] = output[i].replace(/ /g, "") // remove whitespace
    output[i] = output[i].split(",")
    i++
  })
  return output
}

function getValsInParenthesis(input) {
  var output = input.match(/\((.+?)\)/g)
  if (!output) output = []
  var i = 0
  output.forEach(word => {
    output[i] = word.substr(1).substr(0, word.length - 2)
    i++
  })
  return output
}

function getValsBetween(input, start, end, includeStartEnd) {
  var re = new RegExp("\\" + start + "(.+?)\\" + end, "g")
  var output = input.match(re)
  if (!output) output = []

  for (var i = 0; i < output.length; i++) {
    output[i] = output[i].substr(start.length).substr(0, output[i].length - (start.length + end.length))
  }

  if (includeStartEnd) {
    output = start + output + end
  }

  return output
}

function getValsOfMaps(input) {
  var m = input.match(/(.+?)->/g)
  for (var i = 0; i < m.length; i++) {
    var a = m[i].split(",")
    m[i] = a[a.length - 1].substr(0, a[a.length - 1].length - 2)
  }
  console.log(m)
  return m
}

async function select(table, columns, options) {
  /// columns:           Array of strings
  /// options:           {where: whereObj, skip: 2, limit: 2, orderBy: "column", order: "asc" || "desc", extra: "GROUP BY column"}
  /// options.where:     [{type: "and" || "or", col: "column", val: "value", op: "=" || "like"}]

  console.log("selecting...")

  var colStr = ""
  columns = columns.replace(/ /g, "") // remove whitespace

  var countJoins = (columns && columns.indexOf(",") > -1) ? countArrows(columns) : 0
  var joinTables = []
  var joinCols = []
  var joinMapFrom = []
  var joinMapTo = []

  console.log(countJoins)

  if (countJoins > 0) {
    var i = 0
    joinTables = getValsInParenthesis(columns)
    joinCols = getValsInBraces(columns)
    joinMapFrom = getValsOfMaps(columns)
    joinMapTo = getValsBetween(columns, "->", "\(")
    // console.log(joinMapFrom)

    columns = columns.replace(/->(.+?)}/g, "")
    console.log(columns)

    var cols = columns.split(",")
    console.log(cols)

    for (i = 0; i < cols.length; i++) {
      if(joinMapFrom.indexOf(cols[i]) > -1){
        for (var k = 0; k < joinTables.length; k++) {
          for (var j = 0; j < joinCols[k].length; j++) {
            colStr += joinTables[k] + "." + joinCols[k][j] + " AS " + joinTables[k] + "_" + joinCols[k][j] + ","
          }
        }
      } else {
        colStr += table + "." + cols[i] + ","
      }
    }

    colStr = colStr.substr(0, colStr.length - 1)
  } else {
    if (typeof columns == "array") {
      columns.forEach(col => {
        colStr += col + ", "
      })
      if (columns.length > 0) colStr = colStr.substr(0, colStr.length - 2)
    } else if (typeof columns == "string") {
      colStr = columns
    } else {
      throw "Param `columns` is required"
    }
  }

  var queryStr = "SELECT " + colStr + " FROM " + table

  // JOIN?

  if (countJoins > 0) {
    var i = 0
    joinTables.forEach(t => {
      queryStr += " LEFT JOIN " + t + " ON " + table + "." + joinMapFrom[i] + "=" + t + "." + joinMapTo[i]
      i++
    })
  }
  // console.log(queryStr)
  // return 

  // WHERE
  var queryParams = []

  // exclude deleted items...
  var isDeletedAtExisted = await existed("deleted_at", table)

  if (options) {
    queryStr += parseWhere(options.where, queryParams, table)

    if (isDeletedAtExisted) {
      if (countJoins > 0) {
        queryStr += " AND " + table + ".deleted_at IS NULL"
      } else {
        queryStr += " AND deleted_at IS NULL"
      }
    }

    if (options.orderBy) {
      queryStr += " ORDER BY " + options.orderBy
      if (options.order) {
        queryStr += " " + options.order.toUpperCase()
      } else {
        queryStr += " ASC"
      }
    }

    // extra conditions ?
    if (options.extra) queryStr += " " + options.extra

    if (options.skip) queryStr += " OFFSET " + options.skip
    if (options.limit) queryStr += " LIMIT " + options.limit
  } else {
    if (isDeletedAtExisted) {
      if (countJoins > 0) {
        queryStr += " WHERE " + table + ".deleted_at IS NULL"
      } else {
        queryStr += " WHERE deleted_at IS NULL"
      }
    }
  }

  return new Promise(resolve => {
    query(queryStr, queryParams).then((result) => {
      var rows = result.rows
      resolve(rows)
    }).catch((err) => {
      throw err
    })
  })
}

function insert(table, items, returnCols) {
  /// items:          Single Object / Array of Object {id: A, name: B}
  /// returnCols:     String "id,name"

  var count = 0, insertedItems = []

  if (typeof items == "object" && !items.length) {
    items = [items]
  }

  return new Promise(resolve => {
    items.forEach(item => {
      var queryStr = "INSERT INTO " + table + "("
      var valStr = "VALUES("
      var i = 1, vals = []
      for (var key in item) {
        var val = item[key]
        vals.push(val)
        queryStr += key + ", "
        valStr += "$" + i + ", "
        i++
      }
      valStr = valStr.substr(0, valStr.length - 2) + ") "

      queryStr = queryStr.substr(0, queryStr.length - 2) + ") "
      queryStr += valStr

      if (returnCols) {
        queryStr += "RETURNING " + returnCols
      } else {
        queryStr += "RETURNING id"
      }

      db.query(queryStr, vals).then(result => {
        if (result.rows.length > 0) {
          insertedItems.push(result.rows[0])
        }
        // check complete
        count++
        if (count == items.length) resolve(insertedItems)
      })
    })
  })
}

function existed(column, table) {
  var queryStr = "SELECT column_name "
  queryStr += "FROM information_schema.columns "
  queryStr += "WHERE table_name='" + table + "' and column_name='" + column + "';"

  return new Promise(resolve => {
    query(queryStr).then(result => {
      // console.log(result)
      if (result.rows.length > 0) {
        resolve(true)
      } else {
        resolve(false)
      }
    }).catch(err => {
      throw err
    })
  })
}

async function update(table, data, options) {
  /// data:               Data object {id: A, name: B}
  /// options:            {where: whereObj, skip: 2, limit: 2, orderBy: "column", order: "asc" || "desc", return: "id, name", extra: "GROUP BY column"}
  /// options.where:      [{type: "and" || "or", col: "column", val: "value", op: "=" || "like"}]

  if (!options) options = { return: "id" }
  if (options) {
    if (!options.return) options.return = "id"
  }

  var queryParams = []
  var queryStr = "UPDATE " + table + " SET "

  for (var key in data) {
    var val = data[key]
    queryParams.push(val)
    // update if only not null, if null -> keep current value
    queryStr += key + "=COALESCE($" + (queryParams.length) + ", " + key + "), "
  }

  // auto update date
  var isUpdatedAtExisted = await existed("updated_at", table)
  if (isUpdatedAtExisted) queryStr += "updated_at=NOW(), "

  queryStr = queryStr.substr(0, queryStr.length - 2)

  if (options.where) queryStr += parseWhere(options.where, queryParams)

  queryStr += " RETURNING " + options.return

  return new Promise(resolve => {
    query(queryStr, queryParams).then((result) => {
      resolve(result.rows)
    }).catch((err) => {
      throw err
    })
  })
}

function parseWhere(where, queryParams, fromTable) {
  var whereClause = ""

  // if "where" is undefined
  if (!where) {
    return whereClause
  }

  // console.log(where.length)
  // if "where" is an object
  if (typeof where == "object" && !where.length) {
    where = [where]
  }

  // if "where" is an array
  if (where.length > 0) {
    whereClause += " WHERE "
    var index = 0
    where.forEach(whereItem => {
      if (index > 0) {
        if (!whereItem.type || whereItem.type == "and") whereClause += " AND "
      }

      if (!whereItem.op) whereItem.op = "="

      if (whereItem.val == null || whereItem.val == "null") {
        whereClause += (fromTable ? (fromTable + ".") : "") + whereItem.col + " IS NULL"
      } else if (whereItem.val == "notnull" || whereItem.val == "not_null") {
        whereClause += (fromTable ? (fromTable + ".") : "") + whereItem.col + " IS NOT NULL"
      } else {
        whereClause += (fromTable ? (fromTable + ".") : "") + whereItem.col + " " + whereItem.op + " " + '$' + (queryParams.length + 1)
        queryParams.push(whereItem.val)
      }

      index++
    })
  }

  return whereClause
}

function remove(table, where) {
  var params = []
  var sql = "DELETE FROM " + table + parseWhere(where, params)

  return new Promise(resolve => {
    query(sql, params).then((result) => {
      resolve(result.rowCount > 0)
    }).catch((err) => {
      throw err
    })
  })
}

module.exports = {
  debug,
  query,
  select,
  insert,
  update,
  remove,
  count,
  existed
}