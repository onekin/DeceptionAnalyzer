import Alerts from '../../utils/Alerts'
import FileUtils from '../../utils/FileUtils'
import general from './criteriaTemplate/general.json'
import value from './criteriaTemplate/value.json'
import empty from './criteriaTemplate/empty.json'
// import ReviewModels from './criteriaTemplate/ReviewModels'

class ImportSchema {
  static createConfigurationAnnotationsFromReview ({review, callback}) {
    // Create highlighter annotations
    let annotations = review.toAnnotations()
    // Send create highlighter
    window.abwa.storageManager.client.createNewAnnotations(annotations, (err, annotations) => {
      callback(err, annotations)
    })
  }

  static backupReviewGroup (callback) {
    // Get current group id
    let currentGroupId = window.abwa.groupSelector.currentGroup.id
    // Rename current group
    let date = new Date()
    let currentGroupNewName = 'ReviewAndGo-' + date.getFullYear() + '-' + date.getMonth() + '-' + date.getDay() + '-' + date.getHours()
    window.abwa.storageManager.client.updateGroup(currentGroupId, {
      name: currentGroupNewName}, (err, result) => {
      if (err) {
        callback(new Error('Unable to backup current annotation group.'))
      } else {
        callback(null, result)
      }
    })
  }

  /**
   * Ask user for a configuration file in JSON and it returns a javascript object with the configuration
   * @param callback
   */
  static askUserForConfigurationSchema (callback) {
    // Ask user to upload the file
    Alerts.inputTextAlert({
      title: 'Upload your configuration file',
      html: 'Here you can upload your json file with the configuration for the Deception Analyzer highlighter.',
      input: 'file',
      callback: (err, file) => {
        if (err) {
          window.alert('An unexpected error happened when trying to load the alert.')
        } else {
          // Read json file
          FileUtils.readJSONFile(file, (err, jsonObject) => {
            if (err) {
              callback(new Error('Unable to read json file: ' + err.message))
            } else {
              callback(null, jsonObject)
            }
          })
        }
      }
    })
  }

  /**
   * Ask user for a review model and it returns a javascript object with the configuration
   * @param callback
   */
  static askUserForStandardConfigurationSchema (callback) {
    const ReviewModels = require('./criteriaTemplate/ReviewModels')
    let reviewSchemas = ReviewModels.reviews
    let showForm = () => {
      // Create form
      let html = ''
      let selectFrom = document.createElement('select')
      selectFrom.id = 'selectedReview'
      Object.keys(reviewSchemas).forEach(review => {
        let reviewItem = reviewSchemas[review]
        let option = document.createElement('option')
        option.text = reviewItem.name
        option.value = reviewItem.name
        selectFrom.add(option)
      })
      html += 'Selected model:' + selectFrom.outerHTML + '<br>'
      let reviewFile
      Alerts.multipleInputAlert({
        title: 'Please, select one of the review models',
        html: html,
        // position: Alerts.position.bottom, // TODO Must be check if it is better to show in bottom or not
        preConfirm: () => {
          reviewFile = document.querySelector('#selectedReview').value
        },
        showCancelButton: true,
        callback: (err) => {
          let jsonObject
          if (reviewFile === 'General deception analysis') {
            jsonObject = general
          } else if (reviewFile === 'Deception analysis on value') {
            jsonObject = value
          }
          if (err) {
            callback(new Error('Unable to read json file: ' + err.message))
          } else {
            callback(null, jsonObject)
          }
        }
      })
    }
    showForm()
  }

  static retrieveEmptySchema () {
    return empty
  }
}

export default ImportSchema
