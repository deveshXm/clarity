all the features are working. currently we are using mock data. 

now we need to work on the AI Feautres that the bot is providing right now. 

We are going to use Azure AI Foundry and the following library 

@https://github.com/openai/openai-python 

in the env i've set the following three env variables 

# AI
AZURE_API_VERISON="2024-12-01-preview"
AZURE_APU_ENDPOINT="https://deveshai3038897120.openai.azure.com/"
AZURE_API_KEY=1

make abstracted functions to call the azure as in future we might wanna have different providres, etc and use them.

don't overcomplicate the function, we'll make it modular as needed in future.

let's work only on the autocoaching feature right now. 

here's the flow : 

1. recieve user's message where bot is added via webhook

2. pass it to ai and simply prvide all the parameters and ask if it falls in any category and get output in json format. 

3. if the output is No, then do nothing but if the output is yes proceed to the next step/ this is just a minor check so keep the prompt very short and general. even if it seems slighly or possiblly if it can in a cateogry go with the worfloy

4. fetch the history with last 15 messages and their replies. pass it in prompt with user id and proerpyl formatted and ask ai in which category it falls , reason behind it ( one liner ) and a optional field against which person is the text being categories ( like if he is rude so against whom ), 
