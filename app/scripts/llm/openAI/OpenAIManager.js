import _ from 'lodash'
import Alerts from '../../utils/Alerts'
let Swal = null
if (document && document.head) {
  Swal = require('sweetalert2')
}

class OpenAIManager {
  static async askCriteria ({apiKey, documents, callback, prompt}) {
    let alert = function () {
      OpenAIManager.tryToLoadSwal()
      if (_.isNull(Swal)) {
        if (_.isFunction(callback)) {
          Alerts.errorAlert({text: 'Unable to load swal'})
        }
      } else {
        Swal.fire({
          title: 'Asking LLM...',
          text: 'Please wait to the response',
          allowEscapeKey: false,
          allowOutsideClick: false,
          onOpen: async () => {
            Swal.showLoading()
            const b = document.getElementById('swal2-title')
            b.innerText = 'Asking LLM'
            let query
            if (prompt) {
              query = prompt
            }
            chrome.runtime.sendMessage({ scope: 'askLLM', cmd: 'openAI', data: {documents: documents, apiKey: apiKey, query: query} }, function (response) {
              if (chrome.runtime.lastError) {
                Swal.close()
                Alerts.errorAlert({text: 'Unable to ask LLM: ' + chrome.runtime.lastError.message})
              } else if (response.res.error) {
                Swal.close()
                Alerts.errorAlert({text: 'Unable to ask LLM: ' + response.res.error})
              } else {
                Swal.close()
                const jsonString = response.res.text
                console.log('ANSWER: ' + jsonString)
                let retrievedJSON = jsonString.substring(jsonString.indexOf('{') + 1)
                let lastIndex = retrievedJSON.lastIndexOf('}')
                retrievedJSON = retrievedJSON.substring(0, lastIndex)
                retrievedJSON = retrievedJSON.replace(/(\r\n|\n|\r)/gm, '')
                if (!retrievedJSON.startsWith('{')) {
                  retrievedJSON = '{' + retrievedJSON
                }
                if (!retrievedJSON.endsWith('}')) {
                  retrievedJSON = retrievedJSON + '}'
                }
                try {
                  const jsonObject = JSON.parse(retrievedJSON)
                  if (_.isFunction(callback)) {
                    callback(jsonObject)
                  }
                } catch (err) {
                  Alerts.errorAlert({
                    text: 'Please try again. Try to repeat the question. Provided answer has been: ' + retrievedJSON,
                    title: 'Error parsing the answer'
                  })
                }
              }
            })
          }
        })
      }
    }
    alert()
  }

  static tryToLoadSwal () {
    if (_.isNull(Swal)) {
      try {
        Swal = require('sweetalert2')
      } catch (e) {
        Swal = null
      }
    }
  }
}

export default OpenAIManager
