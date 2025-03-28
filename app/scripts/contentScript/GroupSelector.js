import _ from 'lodash'
import $ from 'jquery'
import Alerts from '../utils/Alerts'
import ChromeStorage from '../utils/ChromeStorage'
import LanguageUtils from '../utils/LanguageUtils'
import ImportSchema from '../specific/review/ImportSchema'
import ExportSchema from '../specific/review/ExportSchema'
import ReviewSchema from '../model/schema/Review'
import Events from './Events'
import TagManager from './TagManager'
import LocalStorageManager from '../storage/local/LocalStorageManager'

class GroupSelector {
  constructor () {
    this.selectedGroupNamespace = 'groupManipulation.currentGroup'
    this.groups = null
    this.currentGroup = null
    this.user = {}
  }

  init (callback) {
    this.checkIsLoggedIn((err) => {
      if (err) {
        // Stop propagating the rest of the functions, because it is not logged in storage
        // Show that user need to log in remote storage to continue
        Alerts.errorAlert({
          title: 'Log in selected storage required',
          text: chrome.i18n.getMessage('StorageLoginRequired')
        })
      } else {
        // Retrieve user profile (for further uses in other functionalities of the tool)
        this.retrieveUserProfile(() => {
          // Define current group
          this.defineCurrentGroup(() => {
            this.reloadGroupsContainer()
            if (_.isFunction(callback)) {
              callback(null)
            }
          })
        })
      }
    })
  }

  defineCurrentGroup (callback) {
    // Load all the groups belonged to current user
    this.retrieveGroups((err, groups) => {
      if (err) {
        callback(err)
      } else {
        // If initialization annotation exist, load the corresponding group
        let initAnnotation = window.abwa.annotationBasedInitializer.initAnnotation
        if (_.isObject(initAnnotation) && _.has(initAnnotation, 'group')) {
          let group = _.find(window.abwa.groupSelector.groups, (group) => { return group.id === initAnnotation.group })
          if (_.isObject(group)) {
            this.currentGroup = group
            // Save current group in GoogleStorage
            ChromeStorage.setData(this.selectedGroupNamespace, {data: JSON.stringify(this.currentGroup)}, ChromeStorage.local)
            if (_.isFunction(callback)) {
              callback()
            }
            // Group is loaded, don't need to continue
            return
          }
        }
        // If not found, try the following: get last used group, load default group or create a new default group
        ChromeStorage.getData(this.selectedGroupNamespace, ChromeStorage.local, (err, savedCurrentGroup) => {
          if (!err && !_.isEmpty(savedCurrentGroup) && _.has(savedCurrentGroup, 'data')) {
            // Parse saved current group
            try {
              let savedCurrentGroupData = JSON.parse(savedCurrentGroup.data)
              let currentGroup = _.find(this.groups, (group) => {
                return group.id === savedCurrentGroupData.id
              })
              // Check if group exists in current user
              if (_.isObject(currentGroup)) {
                this.currentGroup = currentGroup
              }
            } catch (e) {
              // Nothing to do
            }
          }
          // If group cannot be retrieved from saved in extension storage
          // Try to load a group with name DefaultReviewModel
          if (_.isEmpty(this.currentGroup)) {
            this.currentGroup = _.find(window.abwa.groupSelector.groups, (group) => { return group.name === 'DefaultReviewModel' })
          }
          // If local annotation storage is selected, open any other group as all of them are for review&go
          if (_.isEmpty(this.currentGroup) && LanguageUtils.isInstanceOf(window.abwa.storageManager, LocalStorageManager)) {
            this.currentGroup = _.first(window.abwa.groupSelector.groups)
          }
          // If group does not exist, create a new one
          if (_.isEmpty(this.currentGroup)) {
            // Is empty, create a new group
            Alerts.createGroupAlert({
              callbackCreateEmpty: () => {
                this.importEmptyConfiguration()
              },
              callbackImportJSON: () => {
                this.importCriteriaConfiguration()
              },
              callbackImportStandard: () => {
                this.importStandardModelConfiguration()
              }
            })
          } else { // If group was found in extension storage
            if (_.isFunction(callback)) {
              callback()
            }
          }
        })
      }
    })
  }

  checkIsLoggedIn (callback) {
    let sidebarURL = chrome.runtime.getURL('pages/sidebar/groupSelection.html')
    $.get(sidebarURL, (html) => {
      // Append sidebar to content
      $('#abwaSidebarContainer').append($.parseHTML(html))
      window.abwa.storageManager.isLoggedIn((err, isLoggedIn) => {
        if (err) {
          callback(new Error('Unexpected error while checking permission to store annotations. Please contact admin.'))
        } else {
          if (!isLoggedIn) {
            // Display login/sign up form
            $('#notLoggedInGroupContainer').attr('aria-hidden', 'false')
            // Hide group container
            $('#loggedInGroupContainer').attr('aria-hidden', 'true')
            // Hide purposes wrapper
            $('#purposesWrapper').attr('aria-hidden', 'true')
            // Open the sidebar to notify user that needs to log in
            window.abwa.sidebar.openSidebar()
            if (_.isFunction(callback)) {
              callback(new Error('Is not logged in'))
            }
          } else {
            if (_.isFunction(callback)) {
              callback()
            }
          }
        }
      })
    })
  }

  retrieveGroups (callback) {
    window.abwa.storageManager.client.getListOfGroups({}, (err, groups) => {
      if (err) {
        if (_.isFunction(callback)) {
          callback(err)
        }
      } else {
        this.groups = groups
        // TODO Remove groups that are not related to Review&Go from storage
        if (_.isFunction(callback)) {
          callback(null, groups)
        }
      }
    })
  }

  retrieveUserProfile (callback) {
    window.abwa.storageManager.client.getUserProfile((err, profile) => {
      if (err) {
        callback(err)
      } else {
        this.user = profile
        if (_.isFunction(callback)) {
          callback(null, profile.groups)
        }
      }
    })
  }

  reloadGroupsContainer (callback) {
    this.retrieveGroups(() => {
      this.container = document.querySelector('#groupSelector')
      this.container.setAttribute('aria-expanded', 'false')
      this.renderGroupsContainer()
      if (_.isFunction(callback)) {
        callback()
      }
    })
  }

  renderGroupsContainer () {
    // Current group element rendering
    let currentGroupNameElement = document.querySelector('#groupSelectorName')
    currentGroupNameElement.innerText = this.currentGroup.name
    currentGroupNameElement.title = this.currentGroup.name
    // Toggle functionality
    let toggleElement = document.querySelector('#groupSelectorToggle')
    if (this.groupSelectorToggleClickEvent) {
      currentGroupNameElement.removeEventListener('click', this.groupSelectorToggleClickEvent)
      toggleElement.removeEventListener('click', this.groupSelectorToggleClickEvent)
    }
    this.groupSelectorToggleClickEvent = this.createGroupSelectorToggleEvent()
    currentGroupNameElement.addEventListener('click', this.groupSelectorToggleClickEvent)
    toggleElement.addEventListener('click', this.groupSelectorToggleClickEvent)
    // Groups container
    let groupsContainer = document.querySelector('#groupSelectorContainerSelector')
    groupsContainer.innerText = ''
    // For each group
    let groupSelectorItemTemplate = document.querySelector('#groupSelectorItem')
    for (let i = 0; i < this.groups.length; i++) {
      let group = this.groups[i]
      let groupSelectorItem = $(groupSelectorItemTemplate.content.firstElementChild).clone().get(0)
      // Container
      groupsContainer.appendChild(groupSelectorItem)
      groupSelectorItem.id = 'groupSelectorItemContainer_' + group.id
      // Name
      let nameElement = groupSelectorItem.querySelector('.groupSelectorItemName')
      nameElement.innerText = group.name
      nameElement.title = 'Move to review model ' + group.name
      nameElement.addEventListener('click', this.createGroupChangeEventHandler(group.id))
      // Toggle
      groupSelectorItem.querySelector('.groupSelectorItemToggle').addEventListener('click', this.createGroupSelectorItemToggleEventHandler(group.id))
      // Options
      groupSelectorItem.querySelector('.renameGroup').addEventListener('click', this.createGroupSelectorRenameOptionEventHandler(group))
      groupSelectorItem.querySelector('.exportGroup').addEventListener('click', this.createGroupSelectorExportOptionEventHandler(group))
      groupSelectorItem.querySelector('.deleteGroup').addEventListener('click', this.createGroupSelectorDeleteOptionEventHandler(group))
    }
    /*
    // New group button
    let newGroupButton = document.createElement('div')
    newGroupButton.innerText = 'Create review model'
    newGroupButton.id = 'createNewModelButton'
    newGroupButton.className = 'groupSelectorButton'
    newGroupButton.title = 'Create a new review model'
    newGroupButton.addEventListener('click', this.createNewReviewModelEventHandler())
    groupsContainer.appendChild(newGroupButton)

    let importStandardGroupButton = document.createElement('div')
    importStandardGroupButton.className = 'groupSelectorButton'
    importStandardGroupButton.innerText = 'Import Analysis Schema'
    importStandardGroupButton.id = 'importStandardModelButton'
    importStandardGroupButton.addEventListener('click', this.createImportStandardGroupButtonEventHandler())
    groupsContainer.appendChild(importStandardGroupButton)
    let importJSONButton = document.createElement('div')
    importJSONButton.className = 'importJSONButton'
    importJSONButton.innerText = 'Import from Schema JSON'
    importJSONButton.id = 'importJSONButton'
    importJSONButton.addEventListener('click', this.createImportGroupButtonEventHandler())
    groupsContainer.appendChild(importJSONButton)
    */
  }

  createGroupSelectorRenameOptionEventHandler (group) {
    return () => {
      this.renameGroup(group, (err, renamedGroup) => {
        if (err) {
          Alerts.errorAlert({text: 'Unable to rename group. Error: ' + err.message})
        } else {
          this.currentGroup = renamedGroup
          this.retrieveGroups(() => {
            this.reloadGroupsContainer(() => {
              this.container.setAttribute('aria-expanded', 'true')
              window.abwa.sidebar.openSidebar()
            })
          })
        }
      })
    }
  }

  createGroupSelectorExportOptionEventHandler (group) {
    return () => {
      this.exportCriteriaConfiguration(group, (err) => {
        if (err) {
          Alerts.errorAlert({text: 'Error when trying to export review model. Error: ' + err.message})
        }
      })
    }
  }

  createGroupSelectorDeleteOptionEventHandler (group) {
    return (e) => {
      this.deleteGroup(group, (err) => {
        if (err) {
          Alerts.errorAlert({text: 'Error when deleting the group: ' + err.message})
        } else {
          // If removed group is the current group, current group must defined again
          if (group.id === this.currentGroup.id) {
            this.currentGroup = null
          }
          // Move to first other group if exists
          this.defineCurrentGroup(() => {
            this.reloadGroupsContainer(() => {
              // Dispatch group has changed
              this.updateCurrentGroupHandler()
              // Expand groups container
              this.container.setAttribute('aria-expanded', 'false')
              // Reopen sidebar if closed
              window.abwa.sidebar.openSidebar()
            })
          })
        }
      })
    }
  }

  createNewReviewModelEventHandler () {
    return () => {
      this.createNewGroup((err, result) => {
        if (err) {
          Alerts.errorAlert({text: 'Unable to create a new group. Please try again or contact developers if the error continues happening.'})
        } else {
          // Update list of groups from storage
          this.retrieveGroups(() => {
            // Move group to new created one
            this.setCurrentGroup(result.id, true, () => {
              // Expand groups container
              this.container.setAttribute('aria-expanded', 'false')
              LanguageUtils.dispatchCustomEvent(Events.groupChanged, {
                group: this.currentGroup,
                time: new Date()
              })
              // Reopen sidebar if closed
              window.abwa.sidebar.openSidebar()
            })
          })
        }
      })
    }
  }

  createNewGroup (callback) {
    Alerts.inputTextAlert({
      title: 'Create a new schema',
      inputPlaceholder: 'Type here the name of your new schema...',
      preConfirm: (groupName) => {
        if (_.isString(groupName)) {
          if (groupName.length <= 0) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('Name cannot be empty.')
          } else if (groupName.length > 25) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('The review model name cannot be higher than 25 characters.')
          } else {
            return groupName
          }
        }
      },
      callback: (err, groupName) => {
        if (err) {
          window.alert('Unable to load swal. Please contact developer.')
        } else {
          groupName = LanguageUtils.normalizeString(groupName)
          window.abwa.storageManager.client.createNewGroup({
            name: groupName,
            description: 'A Review&Go group to conduct a review'
          }, callback)
        }
      }
    })
  }

  deleteGroup (group, callback) {
    Alerts.confirmAlert({
      title: 'Deleting review model ' + group.name,
      text: 'Are you sure that you want to delete the review model. You will lose all the review model and all the annotations done with this review model in all the documents.',
      alertType: Alerts.alertType.warning,
      callback: () => {
        window.abwa.storageManager.client.removeAMemberFromAGroup({id: group.id, user: this.user}, (err) => {
          if (_.isFunction(callback)) {
            if (err) {
              callback(err)
            } else {
              callback(null)
            }
          }
        })
      }
    })
  }

  createGroupChangeEventHandler (groupId) {
    return (e) => {
      this.setCurrentGroup(groupId, true)
    }
  }

  createGroupSelectorItemToggleEventHandler (groupId) {
    return (e) => {
      let groupSelectorItemContainer = document.querySelector('#groupSelectorContainerSelector').querySelector('#groupSelectorItemContainer_' + groupId)
      if (groupSelectorItemContainer.getAttribute('aria-expanded') === 'true') {
        groupSelectorItemContainer.setAttribute('aria-expanded', 'false')
      } else {
        groupSelectorItemContainer.setAttribute('aria-expanded', 'true')
      }
    }
  }

  createGroupSelectorToggleEvent () {
    return (e) => {
      this.toggleGroupSelectorContainer()
    }
  }

  toggleGroupSelectorContainer () {
    let groupSelector = document.querySelector('#groupSelector')
    if (groupSelector.getAttribute('aria-expanded') === 'true') {
      groupSelector.setAttribute('aria-expanded', 'false')
    } else {
      groupSelector.setAttribute('aria-expanded', 'true')
    }
  }

  setCurrentGroup (groupId, updateCurrentGroup, callback) {
    // Set current group
    let newCurrentGroup = _.find(this.groups, (group) => { return group.id === groupId })
    if (newCurrentGroup) {
      this.currentGroup = newCurrentGroup
    }
    // Render groups container
    this.reloadGroupsContainer((err) => {
      if (err) {
        if (_.isFunction(callback)) {
          callback(err)
        }
      } else {
        if (updateCurrentGroup) {
          // Event group changed
          this.updateCurrentGroupHandler(this.currentGroup.id)
        }
        // Open sidebar
        window.abwa.sidebar.openSidebar()
        if (_.isFunction(callback)) {
          callback()
        }
      }
    })
  }

  updateCurrentGroupHandler (groupId = this.currentGroup.id) {
    let currentGroup = _.find(this.groups, (group) => { return groupId === group.id })
    if (_.isObject(currentGroup)) {
      this.currentGroup = currentGroup
      ChromeStorage.setData(this.selectedGroupNamespace, {data: JSON.stringify(this.currentGroup)}, ChromeStorage.local, () => {
        // Dispatch event
        LanguageUtils.dispatchCustomEvent(Events.groupChanged, {
          group: this.currentGroup,
          time: new Date()
        })
      })
    }
  }

  createImportGroupButtonEventHandler () {
    return (e) => {
      this.importCriteriaConfiguration()
    }
  }

  createImportStandardGroupButtonEventHandler () {
    return (e) => {
      this.importStandardModelConfiguration()
    }
  }

  importCriteriaConfiguration () {
    ImportSchema.askUserForConfigurationSchema((err, jsonObject) => {
      if (err) {
        Alerts.errorAlert({text: 'Unable to parse json file. Error:<br/>' + err.message})
      } else {
        Alerts.inputTextAlert({
          alertType: Alerts.alertType.warning,
          title: 'Give a name to your imported review model',
          text: 'When the configuration is imported a new highlighter is created. You can return to your other review models using the sidebar.',
          inputPlaceholder: 'Type here the name of your review model...',
          preConfirm: (groupName) => {
            if (_.isString(groupName)) {
              if (groupName.length <= 0) {
                const swal = require('sweetalert2')
                swal.showValidationMessage('Name cannot be empty.')
              } else if (groupName.length > 25) {
                const swal = require('sweetalert2')
                swal.showValidationMessage('The review model name cannot be higher than 25 characters.')
              } else {
                return groupName
              }
            }
          },
          callback: (err, reviewName) => {
            if (err) {
              window.alert('Unable to load alert. Unexpected error, please contact developer.')
            } else {
              window.abwa.storageManager.client.createNewGroup({name: reviewName}, (err, newGroup) => {
                if (err) {
                  Alerts.errorAlert({text: 'Unable to create a new annotation group. Error: ' + err.message})
                } else {
                  let review = ReviewSchema.fromCriterias(jsonObject)
                  review.storageGroup = newGroup
                  Alerts.loadingAlert({title: 'Configuration in progress', text: 'We are configuring everything to start reviewing.', position: Alerts.position.center})
                  ImportSchema.createConfigurationAnnotationsFromReview({
                    review,
                    callback: (err, annotations) => {
                      if (err) {
                        Alerts.errorAlert({ text: 'There was an error when configuring Review&Go highlighter' })
                      } else {
                        Alerts.closeAlert()
                        // Update groups from storage
                        this.retrieveGroups(() => {
                          this.setCurrentGroup(review.storageGroup.id, true)
                        })
                      }
                    }
                  })
                }
              })
            }
          }
        })
      }
    })
  }

  importStandardModelConfiguration () {
    ImportSchema.askUserForStandardConfigurationSchema((err, jsonObject) => {
      if (err) {
        Alerts.errorAlert({text: 'Unable to parse json file. Error:<br/>' + err.message})
      } else {
        Alerts.inputTextAlert({
          alertType: Alerts.alertType.warning,
          title: 'Give a name to your imported review model',
          text: 'When the configuration is imported a new highlighter is created. You can return to your other review models using the sidebar.',
          inputPlaceholder: 'Type here the name of your schema...',
          preConfirm: (groupName) => {
            if (_.isString(groupName)) {
              if (groupName.length <= 0) {
                const swal = require('sweetalert2')
                swal.showValidationMessage('Name cannot be empty.')
              } else if (groupName.length > 25) {
                const swal = require('sweetalert2')
                swal.showValidationMessage('The schema name cannot be higher than 25 characters.')
              } else {
                return groupName
              }
            }
          },
          callback: (err, reviewName) => {
            if (err) {
              window.alert('Unable to load alert. Unexpected error, please contact developer.')
            } else {
              window.abwa.storageManager.client.createNewGroup({name: reviewName}, (err, newGroup) => {
                if (err) {
                  Alerts.errorAlert({text: 'Unable to create a new annotation group. Error: ' + err.message})
                } else {
                  let review = ReviewSchema.fromDeceptionSchema(jsonObject.criteria)
                  review.storageGroup = newGroup
                  Alerts.loadingAlert({title: 'Configuration in progress', text: 'We are configuring everything to start reviewing.', position: Alerts.position.center})
                  ImportSchema.createConfigurationAnnotationsFromReview({
                    review,
                    callback: (err, annotations) => {
                      if (err) {
                        Alerts.errorAlert({ text: 'There was an error when configuring Review&Go highlighter' })
                      } else {
                        Alerts.closeAlert()
                        // Update groups from storage
                        this.retrieveGroups(() => {
                          this.setCurrentGroup(review.storageGroup.id, false)
                          LanguageUtils.dispatchCustomEvent(Events.groupChanged, {
                            group: this.currentGroup,
                            time: new Date(),
                            isNew: true
                          })
                        })
                      }
                    }
                  })
                }
              })
            }
          }
        })
      }
    })
  }

  importEmptyConfiguration () {
    let jsonObject = ImportSchema.retrieveEmptySchema()
    Alerts.inputTextAlert({
      alertType: Alerts.alertType.warning,
      title: 'Give a name to your imported review model',
      text: 'When the configuration is imported a new highlighter is created. You can return to your other review models using the sidebar.',
      inputPlaceholder: 'Type here the name of your schema...',
      preConfirm: (groupName) => {
        if (_.isString(groupName)) {
          if (groupName.length <= 0) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('Name cannot be empty.')
          } else if (groupName.length > 25) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('The schema name cannot be higher than 25 characters.')
          } else {
            return groupName
          }
        }
      },
      callback: (err, reviewName) => {
        if (err) {
          window.alert('Unable to load alert. Unexpected error, please contact developer.')
        } else {
          window.abwa.storageManager.client.createNewGroup({name: reviewName}, (err, newGroup) => {
            if (err) {
              Alerts.errorAlert({text: 'Unable to create a new annotation group. Error: ' + err.message})
            } else {
              let review = ReviewSchema.fromCriterias(jsonObject)
              review.storageGroup = newGroup
              Alerts.loadingAlert({title: 'Configuration in progress', text: 'We are configuring everything to start reviewing.', position: Alerts.position.center})
              ImportSchema.createConfigurationAnnotationsFromReview({
                review,
                callback: (err, annotations) => {
                  if (err) {
                    Alerts.errorAlert({ text: 'There was an error when configuring Review&Go highlighter' })
                  } else {
                    Alerts.closeAlert()
                    // Update groups from storage
                    this.retrieveGroups(() => {
                      this.setCurrentGroup(review.storageGroup.id, false)
                      LanguageUtils.dispatchCustomEvent(Events.groupChanged, {
                        group: this.currentGroup,
                        time: new Date(),
                        isNew: true
                      })
                    })
                  }
                }
              })
            }
          })
        }
      }
    })
  }

  exportCriteriaConfiguration (group, callback) {
    // Retrieve group annotations
    TagManager.getGroupAnnotations(group, (err, groupAnnotations) => {
      if (err) {

      } else {
        // Export scheme
        ExportSchema.exportConfigurationSchemaToJSONFile(groupAnnotations)
      }
    })
  }

  destroy (callback) {
    if (_.isFunction(callback)) {
      callback()
    }
  }

  renameGroup (group, callback) {
    Alerts.inputTextAlert({
      title: 'Rename review model ' + group.name,
      inputPlaceholder: 'Type here the name of your new review model...',
      inputValue: group.name,
      preConfirm: (groupName) => {
        if (_.isString(groupName)) {
          if (groupName.length <= 0) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('Name cannot be empty.')
          } else if (groupName.length > 25) {
            const swal = require('sweetalert2')
            swal.showValidationMessage('The review model name cannot be higher than 25 characters.')
          } else {
            return groupName
          }
        }
      },
      callback: (err, groupName) => {
        if (err) {
          window.alert('Unable to load swal. Please contact developer.')
        } else {
          groupName = LanguageUtils.normalizeString(groupName)
          window.abwa.storageManager.client.updateGroup(group.id, {
            name: groupName,
            description: group.description || 'A Review&Go group to conduct a review'
          }, callback)
        }
      }
    })
  }
}

export default GroupSelector
