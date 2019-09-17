var express = require('express');
var router = express.Router();

router.use('/signin', require('./signin'));
router.use('/signup', require('./signup'));
router.use('/social', require('./social'));
router.use('/facebook', require('./facebook'));
router.use('/pwFinder', require('./pwFinder'));

module.exports = router;