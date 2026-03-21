function csvToJson(csvString) {
    // each row separated by a new line
    const rows = csvString.split("\n");

    // the header row is the first row in file
    const headers = rows[0].split(",");

    // hold the json data
    const jsonData = [];

    // for each row
    for (let i = 1; i < rows.length; i++) {
        if (!rows[i].trim()) continue;

        // each value is split by a comma
        const values = rows[i].split(",");

        // object to hold key value pair
        const obj = {};

        // for each value in the row, add the header value as the key and row data as the value
        for (let j = 0; j < headers.length; j++) {
            const key = headers[j].trim();
            const value = values[j]?.trim() ?? "";
            obj[key] = value;
        }

        jsonData.push(obj);
    }
    return JSON.stringify(jsonData, null, 2);
}

document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            const jsonData = csvToJson(content);
            document.getElementById('output').innerText = jsonData;
        };
        reader.readAsText(file);
    }
});