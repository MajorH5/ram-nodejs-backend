-- delete users table if it exists
DROP TABLE IF EXISTS Users;
/* create users table */
CREATE TABLE Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    verified BOOLEAN DEFAULT FALSE,
    isAdmin BOOLEAN DEFAULT FALSE,
    verificationToken VARCHAR(1024),
    jwtToken VARCHAR(1024),
    ip VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- delete posts table if it exists
DROP TABLE IF EXISTS Posts;
/* create posts table */