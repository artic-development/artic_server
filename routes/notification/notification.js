var express = require('express');
var router = express.Router();
const db = require('../../modules/pool');
const resMessage = require('../../modules/utils/responseMessage');
const statusCode = require('../../modules/utils/statusCode');
const utils = require('../../modules/utils/utils');
const authUtils = require('../../modules/utils/authUtils');
const Notification = require('../../modules/notificationSchema'); //코드에 쓸 스키마 가져오기
const cron = require('node-cron'); //스케쥴러
const moment = require('moment');

// mongoose promise지원

/*	
	notification type code
	newArticle = 0
	recommend = 1
	notRead = 2
	artic_guide = 3
*/
// newArticle code --> route/archive/:archive_idx/article

// 모든 알림 불러오기
router.get('/', authUtils.isLoggedin, async (req, res) => {
	const userIdx = req.decoded.idx;
	//오름차순 = 1, 내림차순 = -1
	Notification.find({
			'user_idx.user_idx': userIdx
		}).sort({
			'user_idx.isRead': 1,
			date: -1
		})
		.then(async (result) => {
			if (!result[0]) {
				res.status(statusCode.OK).send(utils.successFalse(statusCode.NO_CONTENT, resMessage.NOTIFICATION_NOT_EXIST));
			} else {
				var resArr = Array(); // 결과 배열
				for (var i = 0; i < result.length; i++) {
					var data = new Object();
					var articles = result[i].article_idx;
					var count = 0;

					for (var k = 0, userIdxes = result[i].user_idx; k < userIdxes.length; k++) {
						if (userIdxes[k].user_idx == userIdx) {
							data.isRead = userIdxes[k].isRead;
							break;
						}
					}
					while (count < articles.length) {
						count++;
					}
					data.article_idx = result[i].article_idx;
					data.article_count = count;
					data.string_type = result[i].string_type;
					data.notification_type = result[i].notification_type;
					data.notification_id = result[i]._id;
					data.notification_date = result[i].date;

					resArr[i] = data;
				}
				res.status(statusCode.OK).send(utils.successTrue(statusCode.OK, resMessage.NOTIFICATION_READ_SUCCESS, resArr));
			}
		}).catch((err) => {
			console.log(err)
			res.status(statusCode.OK).send(utils.successFalse(statusCode.DB_ERROR, resMessage.NOTIFICATION_READ_FAIL));
		});
})

// 읽음 변경 통신
// header: _id(해당 알림 id값 주세용)
router.put('/read', authUtils.isLoggedin, async (req, res) => {
	const userIdx = req.decoded.idx;
	Notification.updateMany({
			"user_idx.user_idx": userIdx,
			"_id": req.get('_id')
		}, {
			$set: {
				"user_idx.$.isRead": true
			}
		}, {},
		(err, updateResult) => {
			if (err) {
				res.status(statusCode.OK).send(utils.successFalse(statusCode.DB_ERROR, resMessage.ISREAD_UPDATE_FAIL));
			} else {
				res.status(statusCode.OK).send(utils.successTrue(statusCode.OK, resMessage.ISREAD_UPDATE_SUCCESS, updateResult));
			}
		});
})

// 추천 알림 (마지막 읽은 아티클의 카테고리 중, 무작위 5개(안 읽은 것))
router.post('/1', authUtils.isLoggedin, async (req, res) => {
	const userIdx = req.decoded.idx
	if (userIdx == 1) {
		const getAllUserIdxQuery = 'SELECT user_idx FROM user WHERE user_idx != ?'
		const getRecentViewArticleQuery = 'SELECT article_idx FROM `read` WHERE user_idx = ? ORDER BY date DESC LIMIT 1';
		const getCategoryFromArticleQuery = 'SELECT ac.category_idx FROM archiveArticle aa, archiveCategory ac WHERE aa.article_idx = ? AND aa.archive_idx = ac.archive_idx ORDER BY rand()';
		const getRandomRecommendArticleQuery = 'SELECT aa.article_idx FROM archiveArticle aa, archiveCategory ac WHERE (ac.category_idx = ? AND aa.archive_idx = ac.archive_idx AND aa.article_idx NOT IN' +
			'(SELECT `read`.article_idx FROM `read` WHERE `read`.user_idx = ?)) ORDER BY rand() limit 5';

		const getAllUserIdxResult = await db.queryParam_Arr(getAllUserIdxQuery, [1]);

		var articleResult = [],
			userResult = [];
		for (let i = 0, j = 0; i < getAllUserIdxResult.length; i++) {
			const getRecentViewArticleResult = await db.queryParam_Arr(getRecentViewArticleQuery, [getAllUserIdxResult[i].user_idx]);
			if (getRecentViewArticleResult.length != 0) {
				const getCategoryFromArticleResult = await db.queryParam_Arr(getCategoryFromArticleQuery, [getRecentViewArticleResult[0].article_idx]);
				const getRandomRecommendArticleResult = await db.queryParam_Arr(getRandomRecommendArticleQuery, [getCategoryFromArticleResult[0].category_idx, getAllUserIdxResult[i].user_idx]);
				userResult[j] = getAllUserIdxResult[i].user_idx;
				articleResult[j++] = getRandomRecommendArticleResult;
			}
		}

		let articleArr = [],
			resultArr = [];

		for (let j = 0; j < userResult.length; j++) {
			for (let i = 0; i < articleResult[j].length; i++) {
				articleArr[i] = articleResult[j][i].article_idx;
			}
			userData = {
				user_idx: userResult[j],
				isRead: false
			};

			Notification.createWithDate({
				user_idx: userData,
				article_idx: articleArr,
				notification_type: 1
			}).then((result) => {
				resultArr[j] = result;
			});
		}
		if (!resultArr) {
			res.status(statusCode.OK).send(utils.successFalse(statusCode.DB_ERROR, resMessage.NOTIFICATION_POST_FAIL));
		} else {
			res.status(statusCode.OK).send(utils.successTrue(statusCode.OK, resMessage.NOTIFICATION_POST_SUCCESS));
		}
	} else {
		res.status(statusCode.OK).send(utils.successFalse(statusCode.DB_ERROR, resMessage.NO_ARTIC_MANAGER));
	}
})

// 읽지않은 아티클 알림 등록
router.post('/2', authUtils.isLoggedin, async (req, res) => {
	if (req.decoded.idx == 1) {
		const getAllUserIdxQuery = 'SELECT user_idx FROM user WHERE user_idx != ?'
		const getNotReadArticleIdxQuery = 'SELECT distinct aa.article_idx FROM archive ar, archiveArticle aa WHERE ar.user_idx = ? AND ar.archive_idx = aa.archive_idx ' +
			'AND aa.article_idx NOT IN (SELECT `read`.article_idx FROM `read` WHERE `read`.user_idx = ?)';
		const getAllUserIdxResult = await db.queryParam_Arr(getAllUserIdxQuery, [1]);
		var resultArr = [],
			userResult = [],
			articleResult = [];
		for (let i = 0, j = 0; i < getAllUserIdxResult.length; i++) {
			const getNotReadArticleIdxResult = await db.queryParam_Arr(getNotReadArticleIdxQuery, [getAllUserIdxResult[i].user_idx, getAllUserIdxResult[i].user_idx]);

			console.log(getNotReadArticleIdxResult)
			if (getNotReadArticleIdxResult.length != 0) {
				userResult[j] = getAllUserIdxResult[i].user_idx;
				articleResult[j++] = getNotReadArticleIdxResult;
			}
		}
		let articleArr = [];
		for (let i = 0; i < userResult.length; i++) {
			for (let j = 0; j < articleResult[i].length; j++) {
				articleArr[j] = articleResult[i][j].article_idx;
			}
			const userData = {
				user_idx: userResult[i],
				isRead: false
			}
			Notification.createWithDate({
				user_idx: userData,
				article_idx: articleArr,
				notification_type: 2
			}).then((result) => {
				console.log(result);
				resultArr[i] = result;
			});
		}
		if (!resultArr) {
			res.status(statusCode.OK).send(utils.successFalse(statusCode.DB_ERROR, resMessage.NOTIFICATION_POST_FAIL));
		} else {
			res.status(statusCode.OK).send(utils.successTrue(statusCode.OK, resMessage.NOTIFICATION_POST_SUCCESS));
		}
	} else {
		res.status(statusCode.OK).send(utils.successFalse(statusCode.DB_ERROR, resMessage.NO_ARTIC_MANAGER));
	}
});

// 24시간 이내 생성된 아티클을 알림으로 저장 (AM 08:00 알림)
cron.schedule('0 0 8 * * *', async (result, err) => {
	if (err) {
		throw err;
	} else {
		const getNewArticleQuery = 'SELECT article_idx FROM article WHERE date > ?';
		const getNewArticleResult = await db.queryParam_Arr(getNewArticleQuery, [moment().subtract(24, 'hours').format("YYYY-MM-DD HH:mm:SS")]);
		const getAllUserIdxQuery = 'SELECT user_idx FROM user WHERE user_idx != 1';
		const getAllUserIdxResult = await db.queryParam_None(getAllUserIdxQuery);

		if (!getNewArticleResult[0]) {
			console.log(NOT_FIND_ARTICLE);
		} else {
			for (let i = 0, userData; userData = getAllUserIdxResult[i]; i++) {
				userData.isRead = false;
			}
			var articleArr = [];
			for (let i = 0; i < getNewArticleResult.length; i++) {
				articleArr[i] = getNewArticleResult[i].article_idx;
			}
			result = await Notification.createWithDate({
				user_idx: getAllUserIdxResult,
				article_idx: articleArr,
				notification_type: 0,
				string_type: Math.floor(Math.random() * 5)
			});
		}

	}
})

module.exports = router;