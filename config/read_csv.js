// hold the json data
const jsonData = [];

// fetch the CSV file data
fetch('../data.csv')
    .then(response => response.text()) // reponse
    .then(content => { // show content
        // call the csvToJson function with the content
        const jsonData = csvToJson(content);

        const tanks = [];
        const dps = [];
        const support = [];
        const mage = []; 
        const no_class = []

        for (let i = 0; i < jsonData.length; i++){
            obj = jsonData[i]
            const name = obj.Name
            const strength = obj.Strength
            const defense = obj.Defense
            const power = obj.Power
            const magic = obj.Magic
            const speed = obj.Speed
            

            if (obj.isVillain == "False"){
                if (defense >= 70 && speed <= 50){
                    // add character's name to tank array
                    tanks.push(name)
                }
                else if (strength >= 80 && defense <= 60){
                    dps.push(name)
                }
                else if (power >= 70 && strength <= 20 && defense <= 20){
                    support.push(name)
                }
                else if (magic >= 80 && defense <= 40){
                    mage.push(name)
                }
                else{
                    no_class.push(name)
                }
            }
            
        }

        //output
        text = "Tank: " + tanks + "\nDPS: " + dps + "\nSupport: " + support + "\nMage: " + mage + "\nNo class: " + no_class
        document.getElementById('output').innerText = text//JSON.stringify(jsonData, null, 2);

    });


function csvToJson(csvString) {
    // each row separated by a new line
    const rows = csvString.split("\n");

    // the header row is the first row in file
    const headers = rows[0].split(",");


    // for each row
    for (let i = 1; i < rows.length; i++) {
        if (!rows[i].trim()) continue;

        // each value is split by a comma
        const values = rows[i].split(",");

        // object to hold key value pair
        const obj = {};

        // for each value in the row, add the header value as the key and row data as the value
        for (let j = 0; j < headers.length; j++) {
            // trim values
            const key = headers[j].trim();
            const value = values[j].trim();

            // add key-value pair to object
            obj[key] = value;
        }

        // push object to json
        jsonData.push(obj);
    }


    return jsonData;
}

