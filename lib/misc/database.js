const mysql = require('mysql');

class Database {
    static pool = mysql.createPool({
        connectionLimit: process.env.MYSQL_CONNECTION_LIMIT,
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USERNAME,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    static getConnection () {
        return new Promise((resolve, reject) => {
            this.pool.getConnection((err, connection) => {
                if (err) {
                    console.log('Error getting database connection: ', err.message);
                    return reject(err);
                }

                resolve(connection);
            });
        });
    }

    static query (sql, values) {
        return new Promise((resolve, reject) => {
            this.getConnection()
                .then(connection => {
                    connection.query(sql, values, (err, result) => {
                        connection.release();
                        if (err) {
                            console.log('Error querying database: ', err.message);
                            return reject(err);
                        }
                        resolve(result);
                    });
                })
                .catch(reject);
        });
    }
}

module.exports = Database;
