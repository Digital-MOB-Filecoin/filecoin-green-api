function hdiff(timestamp) {
    return (Math.abs(Date.now() - timestamp) / (1000 * 3600)).toFixed();
}

module.exports = {
    hdiff,
};