async function main() {


    const playerId = 'ae6c8d99-5564-4865-8ca0-e81e83d96095';
    const newGameUrl = `https://berghain.challenges.listenlabs.ai/new-game?scenario=1&playerId=${playerId}`;

    const newGame = await fetch(newGameUrl);

    const gameData = await newGame.json();

    console.log(JSON.stringify(gameData, null, 2));

    /**
     * Output : 
        {
            "gameId": "66bd845d-583f-4e90-abaa-311c233c37a5",
            "constraints": [
                {
                "attribute": "young",
                "minCount": 600
                },
                {
                "attribute": "well_dressed",
                "minCount": 600
                }
            ],
            "attributeStatistics": {
                "relativeFrequencies": {
                "well_dressed": 0.3225,
                "young": 0.3225
                },
                "correlations": {
                "well_dressed": {
                    "well_dressed": 1,
                    "young": 0.18304299322062992
                },
                "young": {
                    "well_dressed": 0.18304299322062992,
                    "young": 1
                }
                }
            }
        }
     */



    // for person 0 accept parameter is optional
    /**
     * Output : 
     * {
    "status": "running",
    "admittedCount": 1,
    "rejectedCount": 0,
    "nextPerson": {
        "personIndex": 1,
        "attributes": {
            "well_dressed": true,
            "young": false
            }
            }
            }
            */
    let personIndex = 0;
    let decideAndNextMove = (await fetch(`https://berghain.challenges.listenlabs.ai/next-person?gameId=${gameData.gameId}&personIndex=${personInde}`)).json();
    console.log(JSON.stringify(person, null, 2));

    while (decideAndNextMove.status === 'running') {
        decideAndNextMove = (await fetch(`https://berghain.challenges.listenlabs.ai/next-person?gameId=${gameData.gameId}&personIndex=${personIndex}`)).json();
        console.log(JSON.stringify(decideAndNextMove, null, 2));
        await new Promise(resolve => setTimeout(resolve, 1000));
    }


}

main();

