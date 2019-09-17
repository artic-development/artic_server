var express = require('express');
var router = express.Router();

const utils = require('../../modules/utils/utils');
const resMessage = require('../../modules/utils/responseMessage');
const statusCode = require('../../modules/utils/statusCode');
const db = require('../../modules/pool');
const encrytion = require('../../modules/encrytion/encrytionModule');
const crypto = require('crypto-promise');
const Notification = require('../../modules/notificationSchema');

//회원가입
router.post('/', async (req, res) => {
    const id = req.body.id;
    const pw = req.body.pw;
    const birth = req.body.birth;
    const name = req.body.name;

    const selectQuery = 'SELECT * FROM user WHERE user_id = ?';
    const insertQuery = 'INSERT INTO user (user_id, user_pw, user_type, user_birth, user_name, salt) VALUES (?, ?, ?, ?, ?, ?)';

    if (!id || !pw || !name || !birth) { //널값으로 들어오면 안돼
        res.status(200).send(utils.successFalse(statusCode.BAD_REQUEST, resMessage.SIGNUP_NULL_VALUE));
    } else { //id중복값 체크
        const selectResult = await db.queryParam_Arr(selectQuery, [id]);
        if (!selectResult) {
            res.status(200).send(utils.successFalse(statusCode.DB_ERROR, resMessage.USER_DB_SELECT_ERROR));
        } else if (selectResult.length >= 1) {
            res.status(200).send(utils.successFalse(statusCode.BAD_REQUEST, resMessage.ALREADY_USER));
        } else {
            const encrytionResult = await encrytion.encrytion(pw);
            const insertResult = await db.queryParam_Arr(insertQuery, [id, encrytionResult.hashedPassword, "user", birth, name, encrytionResult.salt]);
            console.log(insertResult);
            if (!insertResult) {
                res.status(200).send(utils.successFalse(statusCode.DB_ERROR, resMessage.USER_DB_INSERT_ERROR))
            } else {
                const getNewUserQuery = 'SELECT user_idx FROM user WHERE user_id = ?';
                const getNewUserResult = await db.queryParam_Arr(getNewUserQuery, [id]);
                
                getNewUserResult[0].isRead = false
                result = await Notification.createWithDate({
                    user_idx: getNewUserResult,
                    article_idx: 1,
                    notification_type: 3
                });
                res.status(200).send(utils.successTrue(statusCode.CREATED, resMessage.CREATED_USER, req.body));
            }
        }
    }

});

module.exports = router;