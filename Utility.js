exports.Now = function() { return Math.round(new Date().getTime() / 1000); }
exports.MilliNow = function() { return new Date().getTime(); }