require("dotenv").config();
const express = require("express");
const cors = require("cors");
const request = require("request");
const fs = require('fs');
const childProcess = require('child_process');
const fileUpload = require('express-fileupload');
const path = require('path');

const API_ADDRESS = process.env.API_ADDRESS;
const PORT = process.env.PORT;
const MACHINE_INDEX = process.env.MACHINE_INDEX;

const app = express();

app.use(express.json());
app.use(express.urlencoded());
app.use(cors({credentials: true, origin: true}));
app.use(fileUpload());

request.post(
    {
        url: API_ADDRESS + "/register_hub",
        form: {
            MACHINE_INDEX: MACHINE_INDEX,
            PORT: PORT
        }
    },
    (err, response, body) => {
        if (err) {
            console.log(err);
        }
    }
);

app.post("/create_bot", (req, res) => {
    const body = req.body;
    if (!body) res.sendStatus(500);
    if (!body.lang || !body.name) res.sendStatus(500);
    body.name = body.name.toLowerCase();
    if (body.lang === "py") {
        const projectDir = `/var/Bots/${body.name}`
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }
        fs.open(`${projectDir}/Dockerfile`, 'w', (err) => {
            if(err) throw err;
            console.log('Dockerfile created');
        });
        fs.readFile(`PYTHON_DOCKERFILE_EXAMPLE`, 'utf8', (err, data) => {
            if(err) throw err;
            let dockerdata = data.replaceAll("*botname*", body.name);
            fs.writeFile(`${projectDir}/Dockerfile`, dockerdata, (err) => {
                if(err) throw err;
                console.log('Data has been inserted into Dockerfile!');
                fs.readFile(`python_example.py`, 'utf8', (err, data) => {
                    if(err) throw err;
                    let pythondata = data;
                    fs.writeFile(`${projectDir}/main.py`, pythondata, (err) => {
                        if(err) throw err;
                        console.log('Data has been inserted into main.py!');
                        fs.readFile(`requirements_example.txt`, 'utf8', (err, data) => {
                            if(err) throw err;
                            let requirementsdata = data;
                            fs.writeFile(`${projectDir}/requirements.txt`, requirementsdata, (err) => {
                                if(err) throw err;
                                console.log('Data has been inserted into requirements.txt!');
                                restartBot(body.name, projectDir);
                            });
                        });
                    });
                });
            });
        });
    }
    res.sendStatus(200);
});

app.post("/start_bot", (req, res) => {
    const body = req.body;
    if (!body) res.sendStatus(500);
    if (!body.botName) res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    startBot(botName, projectDir);
    res.sendStatus(200);
});

app.post("/update_bot", (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) return res.status(400).send('Файл не был загружен');
    const uploadedFile = req.files.file;
    const botName = req.body.botName.toLowerCase();
    
    const fileName = uploadedFile.name;
    const fileData = uploadedFile.data;

    const projectDir = `/var/Bots/${botName}`;

    const fileNameData = fileName.split(".");
    if (fileNameData[fileNameData.length-1] == "py") {
        fs.unlink(`${projectDir}/main1.py`, err => {
            if (err) console.log(err);
        });
        fs.rename(`${projectDir}/main.py`, `${projectDir}/main1.py`, err => {
            if(err) throw err;
            uploadedFile.mv(`${projectDir}/main.py`, (err) => {
                if (err) return res.status(500).send(err);
                res.sendStatus(200);
                restartBot(botName, projectDir);
            });
        });
    }
    else{
        res.status(500).send("Ошибка при загрузке файла!");
    }
});

app.post("/add_dependencies", (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) return res.status(400).send('Файл не был загружен');
    const uploadedFile = req.files.file;
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    fs.unlink(`${projectDir}/requirements.txt`, err => {
        if(err) console.log(err);
        uploadedFile.mv(`${projectDir}/requirements.txt`, (err) => {
            if (err) return res.status(500).send(err);
            res.sendStatus(200);
            restartBot(botName, projectDir);
        });
    });
});

app.post("/get_logs", (req, res) => {
    if (!req.body) return res.sendStatus(500);
    if (!req.body.botName) return res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    const filePath = path.join(projectDir, '/logs.txt');
    childProcess.exec(`docker logs ${botName} > ${projectDir}/logs.txt`, (error, stdout, stderr) => {
        if (error) console.log(stderr);
        res.sendFile(filePath);
    });
});

app.post("/stop_bot", (req, res) => {
    if (!req.body) return res.sendStatus(500);
    if (!req.body.botName) return res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    stopBot(botName, projectDir, () => res.sendStatus(200), () => res.sendStatus(500));
});

app.post("/restart_bot", (req, res) => {
    if (!req.body) return res.sendStatus(500);
    if (!req.body.botName) return res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    restartBot(botName, projectDir, () => {
        if (!res.closed)
            res.sendStatus(200)
    }, () => {
        if (!res.closed)
            res.sendStatus(500)}
    );
});

app.post("/get_bot_files", (req, res) => {
    if (!req.body) return res.sendStatus(500);
    if (!req.body.botName) return res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    childProcess.exec(
        `zip -r ${projectDir}/${botName}.zip ./`, 
        {cwd: projectDir},
        (error, stdout, stderr) => {
            if (error) console.log(stderr);
            res.sendFile(`${projectDir}/${botName}.zip`, (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Ошибка при отправке файла');
                }
                else {
                    console.log('Файл успешно отправлен');
                }
            });
            setTimeout(() => {
                childProcess.exec(`rm ${projectDir}/${botName}.zip`, (error, stdout, stderr) => {
                    if (error) console.log(stderr);
                });
            }, 3000);
        }
    );
});

app.post("/remove_bot", (req, res) => {
    if (!req.body) return res.sendStatus(500);
    if (!req.body.botName) return res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    const projectDir = `/var/Bots/${botName}`;
    stopBot(botName, projectDir, () => {
        childProcess.exec(
            `rm -fr ${projectDir}`, 
            (error, stdout, stderr) => {
                if (error) console.log(stderr);
                if (!res.writableEndedroot){
                    res.sendStatus(200);
                }
            }
        );
    }, () => res.sendStatus(500));
});

app.post("/get_bot_status", async (req, res) => {
    if (!req.body) return res.sendStatus(500);
    if (!req.body.botName) return res.sendStatus(500);
    const botName = req.body.botName.toLowerCase();
    childProcess.exec(`docker inspect ${botName}`, (error, stdout, stderr) => {
        if (error) console.log(stderr);
        const result = JSON.parse(stdout);
        if (result[0] && result[0]["State"])
            res.send(result[0]["State"]["Status"]);
        else 
            res.send("stopped");
    });
});

function restartBot(botName, botDir, onrestart, onerror) {
    stopBot(botName, botDir, () => {
        startBot(botName, botDir, onrestart, onerror);
    }, onerror);
}

function stopBot(botName, botDir, onstop, onerror) {
    childProcess.exec(`docker stop ${botName}`, (error, stdout, stderr) => {
        if (error) {
            console.log(stderr);
            if (onerror) onerror();
        }
        removeBotContainer(botName, botDir, onstop);
    });
}

function removeBotContainer(botName, botDir, onremove, onerror) {
    childProcess.exec(`docker rm ${botName}`, (error, stdout, stderr) => {
        if (error) console.log(stderr);
        childProcess.exec(`docker rmi ${botName}`, (error, stdout, stderr) => {
            if (error) console.log(stderr);
            if (onremove) onremove();
        });
    });
}

function startBot(botName, botDir, onstart, onerror) {
    childProcess.exec(`docker build -t ${botName} ${botDir}`, (error, stdout, stderr) => {
        if (error) {
            console.log(stderr);
            if (onerror) onerror();
        }
        childProcess.exec(`docker run -d --name ${botName} --mount type=bind,source=${botDir},destination=/${botName} ${botName}`, (error, stdout, stderr) => {
            if (error) {
                console.log(stderr);
                if (onerror) onerror();
            }
            if (onstart) onstart();
        });
    });
}

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
