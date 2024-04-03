-- delete posts table if it exists
DROP TABLE IF EXISTS rotmg_artmaker_db.posts;
-- delete users table if it exists
DROP TABLE IF EXISTS rotmg_artmaker_db.users;

/* create users table */
CREATE TABLE rotmg_artmaker_db.users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    verified BOOLEAN DEFAULT FALSE,
    isAdmin BOOLEAN DEFAULT FALSE,
    verificationToken VARCHAR(1024),
    passwordCode VARCHAR(64),
    lastVerificationRequest TIMESTAMP,
    lastResetRequest TIMESTAMP,
    jwtToken VARCHAR(1024),
    banned BOOLEAN DEFAULT FALSE,
    ip VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

/* create posts table */
CREATE TABLE rotmg_artmaker_db.posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    tags TEXT(1024),
    image TEXT(65535),
    animated BOOLEAN DEFAULT FALSE,
    type ENUM('Items', 'Entities', 'Tiles', 'Objects', 'Misc'),
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);