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

-- create comments table
CREATE TABLE rotmg_artmaker_db.comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT,  -- links comment to a post
    user_id INT,  -- author of the comment
    thread_id BIGINT, -- the thread this comment belongs too
    deleted BOOL DEFAULT 0, -- whether this comment was deleted or not
    parent_comment_id INT DEFAULT NULL,  -- for threaded replies (null if it's a top-level comment)
    text TEXT(2048),  -- content of the comment
    likes INT DEFAULT 0,  -- total number of likes
    dislikes INT DEFAULT 0,  -- total number of dislikes
    replies INT DEFAULT 0,  -- total number of replies (for top-level comments)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- timestamp for when the comment was created
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,  -- link to the posts table
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,  -- link to the users table
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE -- link to the parent comment for replies
);

-- create comment_likes table
CREATE TABLE rotmg_artmaker_db.comment_likes (
    user_id INT,  -- user who liked/disliked the comment
    comment_id INT,  -- comment being liked/disliked
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    like_status ENUM('like', 'dislike') NOT NULL,  -- like or dislike
    PRIMARY KEY (user_id, comment_id),  -- composite primary key to avoid duplicate entries
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,  -- link to users
    FOREIGN KEY i(comment_id) REFERENCES comments(id) ON DELETE CASCADE  -- link to comments
);

-- Create the reports table
CREATE TABLE rotmg_artmaker_db.reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,  -- Unique ID for the report
    user_id INT NOT NULL,  -- User who submitted the report
    reported_user_id INT NOT NULL,  -- User who is being reported
    content_text TEXT(5000) NOT NULL,  -- Store the content text directly
    target_id INT,  --  store the post or comment ID if it still exists
    media_type ENUM('post', 'comment') NOT NULL,  -- Type of content being reported
    reason VARCHAR(280) NOT NULL,  -- Reason for the report
    report_date DATETIME DEFAULT CURRENT_TIMESTAMP,  -- Date and time the report was submitted
    FOREIGN KEY (user_id) REFERENCES rotmg_artmaker_db.users(id) ON DELETE CASCADE,  -- Link to the users table (reporting user)
    FOREIGN KEY (reported_user_id) REFERENCES rotmg_artmaker_db.users(id) ON DELETE CASCADE  -- Link to the users table (reported user)
);


-- create notifications table
CREATE TABLE rotmg_artmaker_db.notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,  -- Unique ID for each notification
    user_id INT NOT NULL,  -- User who receives the notification
    type ENUM('comment', 'comment_reply', 'system') NOT NULL,  -- Type of notification
    metadata JSON NOT NULL,  -- Metadata related to the notification, e.g., stringified JSON
    subject VARCHAR(255),  -- Brief title or subject of the notification
    message TEXT(2048) NOT NULL,  -- Notification message
    is_read BOOLEAN DEFAULT FALSE,  -- Whether the notification has been read
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp for when the notification was created
    FOREIGN KEY (user_id) REFERENCES rotmg_artmaker_db.users(id) ON DELETE CASCADE  -- Link to the users table
);
