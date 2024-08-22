// Create a WebSocket connection to Binance's streaming API
let ws = new WebSocket('wss://stream.binance.com:9443/stream');

// Initialize global variables
let globalArray = [];  // Array to store processed candle data
let cardList = {};     // Object to store data for display cards
let customAlertList = {};  // Object to store custom alerts set by the user

// Function to fetch the list of perpetual futures symbols from Binance
const fetchFutureSymbols = async () => {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Filter symbols to include only those with a contract type of 'PERPETUAL'
    const symbols = data.symbols.filter(symbol => symbol.contractType === 'PERPETUAL');
    console.log(symbols);

    // Filter symbols to include only USDT and BUSD pairs, prioritizing USDT pairs
    let filteredSymbols = [];
    symbols.map(e => {
        if (e.status === 'TRADING' && (e.quoteAsset === 'USDT' || e.quoteAsset === 'BUSD')) {
            filteredSymbols[filteredSymbols.length] = `${e.baseAsset}${e.quoteAsset}`;
        }
    });

    console.log(filteredSymbols);
    return filteredSymbols;
};

// Function to fetch historical candle data for each symbol
const fetchPastCandles = async () => {
    const symbols = await fetchFutureSymbols();

    // Dynamically generate a dropdown list and input fields for user alerts
    document.getElementsByClassName("tools")[0].innerHTML = `<div class='selector'><select class='coinCname'>
    ${await Promise.all(symbols.sort().map(async e => {
        return e ? `<option value='${e}'>${e}</option>` : null;
    }))}
    </select> <input id='volume' value placeholder='volume'><input id='spread' value placeholder='spread'><input id='amp' value placeholder='amp'> <button onclick='customAlert()' class='add'>Add</div></div><div class='selectorInfo'></div>`;

    const interval = '1m';  // Set the candle interval to 1 minute
    const limit = 500;  // Limit the number of candles fetched to 500
    const startTime = Date.now() - 500 * 60000;  // Set start time 500 minutes ago
    const endTime = Date.now();  // Set end time to current time

    // Initialize an object to store the candle data for each symbol
    const candles = {};
    symbols.forEach(symbol => {
        candles[symbol] = {
            processedValue: {},
            historicalData: []
        };
    });

    // Fetch the historical candle data for each symbol
    await Promise.all(symbols.map(async (symbol) => {
        const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (symbol == 'WAVESBUSD') {
            console.log(data);
        }

        // Store the processed candle data in the candles object
        candles[symbol].historicalData = data.map(candle => ({
            openTime: candle[0],
            openPrice: parseFloat(candle[1]),
            highPrice: parseFloat(candle[2]),
            lowPrice: parseFloat(candle[3]),
            closePrice: parseFloat(candle[4]),
            volume: parseFloat(candle[5]),
            numberOfTrades: parseFloat(candle[6]),
            spread: Number((parseFloat(candle[4]) - parseFloat(candle[1])) / parseFloat(candle[1]) * 100),
            amp: Number((parseFloat(candle[2]) - parseFloat(candle[3])) / parseFloat(candle[3]) * 100),
        })).reverse();
    }));
    console.log(candles);
    return candles;
};

// WebSocket message handler to process incoming data
ws.onmessage = (e) => {
    displayData(JSON.parse(e.data).data);
}

// Function to close the WebSocket connection
const closeWS = () => {
    ws.send(JSON.stringify({
        "method": "UNSUBSCRIBE",
        "params": coinList,
        "id": 312
    }));
    ws.close();
}

// Function to initialize the WebSocket connection and subscribe to symbol streams
const connectingWS = async () => {
    globalArray = await fetchPastCandles();
    await preProccessing(globalArray);
    await tableIntCheck();

    // Construct the subscription list for WebSocket
    let coinList = [];
    for (const key in globalArray) {
        coinList[coinList.length] = `${key.toLowerCase()}@kline_1m`;
    }

    // Send subscription request to WebSocket
    ws.send(JSON.stringify({
        "method": "SUBSCRIBE",
        "params": coinList,
        "id": 1
    }));
}

// Function to process the fetched candle data for volume and spread calculations
const preProccessing = async (arr) => {
    // Helper function to sum up specific values from the candle data
    function sumValues(arr, loopLength, value, name) {
        let sum = 0;
        for (let i = 0; i < loopLength; i++) {
            try {
                if (value == 'volume' && loopLength == 500 && name == 'WAVESBUSD') {
                    console.log(`Sum: ${sum} name:${name}`);
                }
                if (arr[i][value] == "undefined") { continue; }
                sum += Math.abs(arr[i][value]);
            } catch (e) { console.log(`error In:${name}`); }
        }
        if (value == 'volume' && loopLength == 500 && name == 'WAVESBUSD') {
            console.log(`Sum: ${sum} name:${name}`);
        }
        return sum;
    }
    console.log(arr);

    // Store processed values (sum of volume and spread) in globalArray
    for (const key in globalArray) {
        globalArray[key].processedValue.sumVolume500Candle = sumValues(globalArray[key].historicalData, 500, 'volume', key);
        globalArray[key].processedValue.sumVolume20Candle = sumValues(globalArray[key].historicalData, 20, 'volume');
        globalArray[key].processedValue.sumSpread500Candle = sumValues(globalArray[key].historicalData, 500, 'spread');
        globalArray[key].processedValue.sumSpread20Candle = sumValues(globalArray[key].historicalData, 20, 'spread');
    }
    console.log(globalArray);
}

// Function to initialize the table display with headers and data rows
const tableIntCheck = async () => {
    for (const key in globalArray) {
        document.getElementById('mainBoody').innerHTML += `
        <tr class="c${key}">
        <th class='coinName'>${key}</th>
        <th class='spread'></th>
        <th class='AMPL'></th>
        <th class='VolChg'></th>
        <th class='NTrades'></th>
        </tr>
        `;
    }
}

// Function to display the data received via WebSocket
const displayData = async (e) => {
    let candleData = {
        name: e.k.s,
        spread: calculateSpreadPercentage(e.k.o, e.k.c),
        volume: Number(e.k.v),
        amp: calculateSpreadPercentage(e.k.l, e.k.h),
        color: calculateSpreadPercentage(e.k.o, e.k.c) > 0 ? '#089981' : '#f23645'
    };

    populateTable(candleData);
    cardCalculation(candleData);

    // Check if the coin has custom alerts set
    if (customAlertList[candleData.name]) {
        const alert = customAlertList[candleData.name];
        
        // Check if the volume or spread meets the custom alert criteria
        if ((alert.volume && candleData.volume >= alert.volume) || 
            (alert.spread && candleData.spread >= alert.spread)) {
            // Trigger the displayCard function when conditions are met
            if (alert.volume && candleData.volume >= alert.volume) {
                displayCard(candleData, 'Volume Alert', candleData.volume);
            }
            if (alert.spread && candleData.spread >= alert.spread) {
                displayCard(candleData, 'Spread Alert', candleData.spread);
            }
        }
    }
};

// Function to populate the table with the latest data
const populateTable = async (e) => {
    coin = document.getElementsByClassName(`c${e.name}`)[0];
    coin.setAttribute('style', `order:-${Math.abs(e.spread.toFixed(3) * 1000)}`);
    coin.getElementsByClassName('coinName')[0].innerHTML = e.name;
    coin.getElementsByClassName('spread')[0].innerHTML = Math.abs(e.spread.toFixed(3));
    coin.getElementsByClassName('spread')[0].setAttribute('style', `color:${e.color}`);
    coin.getElementsByClassName('AMPL')[0].innerHTML = e.amp.toFixed(3);
    coin.getElementsByClassName('VolChg')[0].innerHTML = e.volume.toFixed(0);
    coin.getElementsByClassName('NTrades')[0].innerHTML = e.numberOfTrades;
}

// Function to calculate the spread percentage
function calculateSpreadPercentage(open, close) {
    const spread = close - open;
    const spreadPercentage = (spread / open) * 100;
    return spreadPercentage;
}

// Initialize variables for card calculations
let cardVolume = 0;
let cardSpread = 0;
let cardAMP = 0;

// Function to calculate and display cards based on conditions
const cardCalculation = (e) => {
    cardVolume = 0;
    cardSpread = 0;
    cardAMP = 0;

    // Condition 1: AMPL > 4%
    if (e.amp > 4) {
        cardAMP = e.amp;
        displayCard(e, 'AMPL >= 4%', cardAMP);
        console.log(`Name:${e.name}  cardAMP: ${cardAMP}`);
    }

    // Condition 2: Spread >= 30X AVG Spread
    if (e.spread >= globalArray[e.name].processedValue.sumSpread500Candle / 500 * 30) {
        cardSpread = e.spread;
        displayCard(e, 'Spread > 30X AVGSpread', cardSpread);
        console.log(`Name:${e.name}  cardSpread: ${cardSpread}`);
    }

    // Condition 3: Volume > 150X AVG Volume
    if (e.volume > (globalArray[e.name].processedValue.sumVolume500Candle / 500) * 150) {
        cardVolume = e.volume;
        displayCard(e, 'Volume > 150X AVGvolume', cardVolume);
        console.log(`Name:${e.name}  AVGvolume: ${globalArray[e.name].processedValue.sumVolume20Candle}--cardVolume: ${cardVolume}`);
    }

    // Condition 4: 3 consecutive green candles with 5x AVG Spread
    if ((e.spread > globalArray[e.name].processedValue.sumSpread500Candle * 5) &&
        globalArray[e.name].historicalData[0].spread > 0 &&
        globalArray[e.name].historicalData[1].spread > 0 &&
        globalArray[e.name].historicalData[1].spread > 0) {
        cardSpread = e.spread;
    }
}

// Function to display cards with specific data
const displayCard = (e, cardType, value) => {
    if (!cardList[e.name]) {
        document.getElementsByClassName('cards')[0].innerHTML += `
        <div style='border:${e.spread > 0 ? '3px solid #1e8c81' : '3px solid #c53434'}' class='card'>
        <div class='del'></div>
        <div class='cardHeader'>
        <div class='cardName'>${e.name}</div>
        </div>
        <div class='cardBody'>
        </div>
        <div class='cardFooter'>
        ${cardType}
        </div>
        </div>
        `;
    }

    if (!cardList[e.name]) {
        cardList[e.name] = {
            type: [{ cardType: cardType, value: value }]
        };
    }
    console.log(cardList);
}

// Function to simulate WebSocket data for testing
function simulateBinanceWebSocket() {
    let arr = [{
        s: 'BTCUSDT',
        t: 'time',
        o: 27187,
        h: 27202,
        l: 27187,
        c: 27202,
        v: 200
    },
    {
        s: 'BTCUSDT',
        t: 'time',
        o: 27187,
        h: 27202,
        l: 27187,
        c: 27202,
        v: 300
    },
    {
        s: 'BTCUSDT',
        t: 'time',
        o: 27187,
        h: 27202,
        l: 27187,
        c: 27202,
        v: 500
    },
    {
        s: 'BTCUSDT',
        t: 'time',
        o: 27187,
        h: 28374,
        l: 27187,
        c: 28374.48,
        v: 37000
    }];
    arr.map(e => {
        console.log('Test');
        cardCalculation({
            name: e.s,
            spread: calculateSpreadPercentage(e.o, e.c),
            volume: Number(e.v),
            amp: calculateSpreadPercentage(e.l, e.h),
            color: calculateSpreadPercentage(e.o, e.c) > 0 ? 'green' : 'red'
        });
    });
}

// Function to add custom alerts based on user input
const customAlert = () => {
    let symbol = document.getElementsByClassName('coinCname')[0].value;
    let volume = parseFloat(document.getElementById('volume').value);
    let spread = parseFloat(document.getElementById('spread').value);

    customAlertList[symbol] = {
        volume: isNaN(volume) ? null : volume,
        spread: isNaN(spread) ? null : spread,
        name: symbol
    };

    // Display the list of custom alerts
    document.getElementsByClassName('selectorInfo')[0].innerHTML = '';
    for (symbol in customAlertList) {
        document.getElementsByClassName('selectorInfo')[0].innerHTML += `<div class='icon'>
        <div class='del' onclick='delFromCustomList("${symbol}")'>X</div>
        ${symbol}</div>`;
    }
}


// Function to remove a symbol from the custom alert list
const delFromCustomList = (symbol) => {
    delete customAlertList[symbol];

    // Update the displayed list of custom alerts
    document.getElementsByClassName('selectorInfo')[0].innerHTML = '';
    for (symbol in customAlertList) {
        document.getElementsByClassName('selectorInfo')[0].innerHTML += `<div class='icon'><div class='del' onclick='delFromCustomList("${symbol}")'>X</div>${symbol}</div>`;
    }
}

// Initialize WebSocket connection
connectingWS();
