const { Lotus } = require('./lotus');

(async () => {
    const lotus = new Lotus(
        "https://1v0Fv7VNbxGKxqDw2MYx0fDte9X:9c472fe5f06be7ecf23f0723e6f24a05@filecoin.infura.io",
        "config.lotus.token"
    );

    //console.log(await lotus.StateListMiners());
    console.log(await lotus.StateMinerInfo('f0131822'));
})();