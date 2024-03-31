const mysql = require('mysql');

class Database {
    static driver = mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USERNAME,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    static connect () {
        return new Promise((resolve, reject) => {
            this.driver.connect(err => {
                if (err) {
                    console.log('Error connecting to database: ', err.message);
                    return reject(err);
                }

                resolve();
            });
        });
    }

    static query (sql, values) {
        return new Promise((resolve, reject) => {
            this.driver.query(sql, values, (err, result) => {
                if (err) {
                    console.log('Error querying database: ', err.message);
                    return reject(err);
                }

                resolve(result);
            });
        });
    }
}

module.exports = Database;