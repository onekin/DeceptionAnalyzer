/* eslint-disable */

import Config from '../../Config'
import Alerts from '../../utils/Alerts'
import AnnotationUtils from '../../utils/AnnotationUtils'
import LocalStorageManager from '../../storage/local/LocalStorageManager'
import jsYaml from 'js-yaml'


const axios = require('axios')
const _ = require('lodash')
const LanguageUtils = require('../../utils/LanguageUtils')
const $ = require('jquery')
require('jquery-contextmenu/dist/jquery.contextMenu')
const {Review, AssessedTag, Annotation} = require('../../exporter/reviewModel.js')
const FileSaver = require('file-saver')
const Events = require('../../contentScript/Events')

let Swal = null
if (document && document.head) {
  Swal = require('sweetalert2')
}

class ReviewGenerator {
  init (callback) {
    // Create generator button
    let generatorWrapperURL = chrome.runtime.getURL('pages/specific/review/generator.html')
    axios.get(generatorWrapperURL).then((response) => {
      document.querySelector('#abwaSidebarContainer').insertAdjacentHTML('afterbegin', response.data)
      this.container = document.querySelector('#reviewGenerator')
      // Set generator image and event
      let categoryGeneratorImageURL = chrome.runtime.getURL('/images/generator.png')
      this.categoryBasedImage = this.container.querySelector('#categoryReviewGeneratorButton')
      this.categoryBasedImage.src = categoryGeneratorImageURL
      this.categoryBasedImage.addEventListener('click', () => {
        this.generateCategoryReviewButtonHandler()
      })
      // Set delete annotations image and event
      let deleteAnnotationsImageURL = chrome.runtime.getURL('/images/deleteAnnotations.png')
      this.deleteAnnotationsImage = this.container.querySelector('#deleteAnnotationsButton')
      this.deleteAnnotationsImage.src = deleteAnnotationsImageURL
      this.deleteAnnotationsImage.addEventListener('click', () => {
        this.deleteAnnotations()
      })
      // Set create canvas image and event
      let overviewImageURL = chrome.runtime.getURL('/images/overview.png')
      this.overviewImage = this.container.querySelector('#overviewButton')
      this.overviewImage.src = overviewImageURL
      this.overviewImage.addEventListener('click', () => {
        this.generateCanvas()
      })
      // Set configuration button
      let configurationImageURL = chrome.runtime.getURL('/images/configuration.png')
      this.configurationImage = this.container.querySelector('#configurationButton')
      this.configurationImage.src = configurationImageURL
      this.configurationImage.addEventListener('click', () => {
        this.configurationButtonHandler()
      })
      if (_.isFunction(callback)) {
        callback()
      }
      // New schema button
      // let newSchemaImageURL = chrome.runtime.getURL('/images/add.png')
      this.newSchemaImage = this.container.querySelector('#newSchemaButton')
      // this.newSchemaImage.src = newSchemaImageURL
      this.newSchemaImage.addEventListener('click', () => {
        this.newSchemaButtonHandler()
      })
      if (_.isFunction(callback)) {
        callback()
      }
    })
  }
  parseAnnotations (annotations){
    let currentTags = window.abwa.tagManager.currentTags
    const criterionTag = Config.review.namespace + ':' + Config.review.tags.grouped.relation + ':'
    const levelTag = Config.review.namespace + ':' + Config.review.tags.grouped.subgroup + ':'


    let r = new Review()

    for (let a in annotations) {
      let criterion = null
      let level = null
      let group = null
      for (let t in annotations[a].tags) {
        if (annotations[a].tags[t].indexOf(criterionTag) != -1) criterion = annotations[a].tags[t].replace(criterionTag, '').trim()
        if (annotations[a].tags[t].indexOf(levelTag) != -1) level = annotations[a].tags[t].replace(levelTag, '').trim()
      }
      if(criterion!=null){
        let g = window.abwa.tagManager.currentTags.find((el) => {return el.config.name === criterion})
        if (g!=null) group = g.config.options.group
      }
      let textQuoteSelector = null
      let highlightText = '';
      let pageNumber = null
      for (let k in annotations[a].target) {
        if (annotations[a].target[k].selector.find((e) => { return e.type === 'TextQuoteSelector' }) != null) {
          textQuoteSelector = annotations[a].target[k].selector.find((e) => { return e.type === 'TextQuoteSelector' })
          highlightText = textQuoteSelector.exact
        }
        if (annotations[a].target[k].selector.find((e) => { return e.type === 'FragmentSelector'}) != null){
          pageNumber = annotations[a].target[k].selector.find((e) => { return e.type === 'FragmentSelector'}).page
        }
      }
      let annotationText
      if (annotations[a].text!==null&&annotations[a].text!=='') {
        if (annotations[a].text) {
          annotationText = JSON.parse(annotations[a].text)
        } else {
          annotationText = { comment: '' }
        }
      } else {
        annotationText = { comment: '' }
      }
      let comment = annotationText.comment !== null ? annotationText.comment : null
      let clarifications = annotationText.clarifications !== null ? annotationText.clarifications : null
      let factChecking = annotationText.factChecking !== null ? annotationText.factChecking : null
      let socialJudge = annotationText.socialJudge !== null ? annotationText.socialJudge : null
      r.insertAnnotation(new Annotation(annotations[a].id,criterion,level,group,highlightText.replace(/(\r\n|\n|\r)/gm, ''),pageNumber,comment,clarifications,factChecking,socialJudge))
    }
    currentTags.forEach((currentTagGroup) => {
      let criterion = currentTagGroup.config.name
      let tagGroupAnnotations
      if (window.abwa.contentAnnotator) {
        let annotations = window.abwa.contentAnnotator.allAnnotations
        // Mark as chosen annotated tags
        for (let i = 0; i < annotations.length; i++) {
          let model = window.abwa.tagManager.model
          let tag = model.namespace + ':' + model.config.grouped.relation + ':' + criterion
          tagGroupAnnotations = annotations.filter((annotation) => {
            return AnnotationUtils.hasATag(annotation, tag)
          })
        }
      }
      let compile = ''
      if (currentTagGroup.config.options.compile && currentTagGroup.config.options.compile.length > 0) {
        const findResume = currentTagGroup.config.options.compile.find((resume) => {
          return resume.document === window.abwa.contentTypeManager.pdfFingerprint
        })
        if (findResume) {
          compile = findResume
        }
      }
      let alternative = ''
      if (currentTagGroup.config.options.alternative && currentTagGroup.config.options.alternative.length > 0) {
        const findAlternative = currentTagGroup.config.options.alternative.find((alternative) => {
          return alternative.document === window.abwa.contentTypeManager.pdfFingerprint
        })
        if (findAlternative) {
          if (Array.isArray(findAlternative.answer)) {
            alternative = findAlternative.answer.join('')
          }
          else  {
            alternative = findAlternative.answer
          }
        }
      }
      let fullQuestion = ''
      if (currentTagGroup.config.options.fullQuestion && currentTagGroup.config.options.fullQuestion.length > 0) {
        const findFullQuestion = currentTagGroup.config.options.fullQuestion.find((question) => {
          return question.document === window.abwa.contentTypeManager.pdfFingerprint
        })
        if (findFullQuestion) {
          fullQuestion = findFullQuestion
        }
      }
      let description = ''
      if (currentTagGroup.config.options.description) {
        description = currentTagGroup.config.options.description
      }
      let data = {}
      data.criterion = currentTagGroup.config.name
      data.group = currentTagGroup.config.options.group
      if (compile) {
        data.compile = compile
      }
      if (alternative) {
        data.alternative = alternative
      }
      if (fullQuestion) {
        data.fullQuestion = fullQuestion
      }
      if (description) {
        data.description = description
      }
      let assessedTag = new AssessedTag(data)
      r.insertCriteria(assessedTag)
      if (compile || alternative || (tagGroupAnnotations && tagGroupAnnotations.length > 0)) {
        r.insertAssessedCriteria(assessedTag)
      }
    })
    return r
  }

  generateCategoryReviewButtonHandler () {
    // Create context menu
    $.contextMenu({
      selector: '#categoryReviewGeneratorButton',
      trigger: 'left',
      build: () => {
        // Create items for context menu
        let items = {}
        items['html'] = {name: 'Export as HTML'}
        items['excel'] = {name: 'Export as .csv'}
        return {
          callback: (key, opt) => {
            if (key === 'html') {
              this.generateReviewByCategory()
            } else if (key === 'excel') {
              this.generateExcel()
            }
          },
          items: items
        }
      }
    })
  }

  newSchemaButtonHandler () {
    Alerts.createGroupAlert({
      callbackCreateEmpty: () => {
        window.abwa.groupSelector.importEmptyConfiguration()
      },
      callbackImportJSON: () => {
        window.abwa.groupSelector.importCriteriaConfiguration()
      },
      callbackImportStandard: () => {
        window.abwa.groupSelector.importStandardModelConfiguration()
      }
    })
  }

  generateExcel () {
    let db = window.abwa.storageManager.annotationsDatabase
    let annotations = this.getReviewCriteriaAnnotations(db, window.abwa.groupSelector.currentGroup.id)
    console.log(annotations)

    // STEP 1: Build document ID → local file URL mapping
    let documentIdToLocalFileMap = {}
    db.annotations.forEach(annotation => {
      if (annotation.document && Array.isArray(annotation.document.link)) {
        const docId = annotation.document.documentFingerprint
        const localFile = annotation.document.link.find(link => link.type === "localfile")
        if (docId && localFile) {
          documentIdToLocalFileMap[docId] = localFile.href
        }
      }
    })

    let result = []
    annotations.forEach(annotation => {
      const criteriaTag = annotation.tags.find(tag => tag.startsWith("review:criteria:"))
      const criteria = criteriaTag ? criteriaTag.replace("review:criteria:", "") : null

      // Parse the text (YAML-like)
      let parsed;
      try {
        parsed = jsYaml.load(annotation.text)
      } catch (e) {
        console.warn("Failed to parse annotation text as YAML", annotation.text)
        return
      }

      const description = parsed.description || ''

      if (Array.isArray(parsed.compile)) {
        parsed.compile.forEach(entry => {
          result.push({
            criteria,
            description,
            document: entry.document,
            answer: entry.answer
          })
        })
      }
    })

    console.log(result)
    const grouped = this.groupByCriteria(result) // assuming your array is called `data`

    console.log(grouped)
    const csv = this.generateCriteriaMatrixCSV(grouped, documentIdToLocalFileMap) // `grouped` is your input object
    console.log(csv)

    // Optional: download as a .csv file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    let name = window.abwa.groupSelector.currentGroup.name + '.csv'
    link.download = name
    link.click();
  }

  groupByCriteria(entries) {
    return entries.reduce((groups, entry) => {
      const key = entry.criteria

      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(entry)
      return groups
    }, {})
  }

  generateCriteriaMatrixCSV (groupedData, documentIdToLocalFileMap) {
    const documentsSet = new Set()
    const criteriaList = Object.keys(groupedData)

    // Step 1: Collect all unique documents
    for (const criteria of criteriaList) {
      for (const entry of groupedData[criteria]) {
        documentsSet.add(entry.document)
      }
    }

    const documents = Array.from(documentsSet)

    // Step 2: Create header with criteria and their descriptions
    const header = ['DOCUMENT']
    for (const criteria of criteriaList) {
      const firstEntry = groupedData[criteria][0]
      const description = firstEntry.description || ''
      const label = `${criteria}: ${description.replace(/"/g, '""')}`
      header.push(`"${label}"`);
    }

    // Step 3: Build rows
    const rows = [header]

    for (const doc of documents) {
      const fileUrl = documentIdToLocalFileMap[doc] || 'N/A'

      // Extract just the filename from the file URL
      let filename = 'N/A'
      if (fileUrl !== 'N/A') {
        try {
          filename = decodeURIComponent(new URL(fileUrl).pathname.split("/").pop())
        } catch (e) {
          console.warn("Failed to parse file URL:", fileUrl)
        }
      }

      const row = [filename]  // Use filename here instead of full path
      for (const criteria of criteriaList) {
        const entry = groupedData[criteria].find(e => e.document === doc)
        if (!entry) {
          row.push('')
        } else {
          const answer = typeof entry.answer === 'string'
            ? entry.answer
            : entry.answer.statement || ''
          row.push(`"${answer.replace(/"/g, '""')}"`)
        }
      }
      rows.push(row)
    }

    // Step 4: Convert to CSV
    const csv = rows.map(row => row.join(',')).join('\n')
    return csv
  }

  getReviewCriteriaAnnotations(data, groupId) {
    return data.annotations.filter(annotation => {
      return (
        annotation.group === groupId &&
        annotation.tags &&
        annotation.tags.some(tag => tag.startsWith("review:criteria:"))
      );
    })
  }

  configurationButtonHandler () {
    // Create context menu
    $.contextMenu({
      selector: '#configurationButton',
      trigger: 'left',
      build: () => {
        // Create items for context menu
        let items = {}
        items['manual'] = {name: 'User manual'}
        items['questionnaire'] = {name: 'Feedback'}
        items['config'] = {name: 'Configuration'}
        items['prompts'] = {name: 'Prompts'}
        return {
          callback: (key, opt) => {
            if (key === 'manual') {
              window.open("https://github.com/onekin/CoReviewer","_blank")
            } else if (key === 'questionnaire') {
              // window.open("https://forms.gle/5u8wsh2xUW8KcdtC9","_blank")
              console.log('TODO')
            } else if (key === 'config') {
              window.open(chrome.runtime.getURL('/pages/options.html'),"_blank")
            } else if (key === 'prompts') {
              window.open(chrome.runtime.getURL('/pages/promptConfiguration.html'), "_blank")
            }
          },
          items: items
        }
      }
    })
  }

  generateReviewByCategory () {
    Alerts.loadingAlert({text: chrome.i18n.getMessage('GeneratingReviewReport')})
    let review = this.parseAnnotations(window.abwa.contentAnnotator.allAnnotations)
    let report = review.groupByCategoryHTML()
    // let blob = new Blob([report], {type: 'text/plain;charset=utf-8'})
    let blob = new Blob([report], {type: 'text/html;charset=utf-8'});
    let title = window.PDFViewerApplication.baseUrl !== null ? window.PDFViewerApplication.baseUrl.split("/")[window.PDFViewerApplication.baseUrl.split("/").length-1].replace(/\.pdf/i,"") : ""
    let docTitle = 'Review report'
    if(title!=='') docTitle += ' for '+title
    FileSaver.saveAs(blob, docTitle+'.html')
    Alerts.closeAlert()
  }

  generateCanvas () {
    window.abwa.sidebar.closeSidebar()
    Alerts.loadingAlert({text: chrome.i18n.getMessage('GeneratingReviewReport')})
    let review = this.parseAnnotations(window.abwa.contentAnnotator.allAnnotations)
    let canvasPageURL = chrome.runtime.getURL('pages/specific/review/reviewCanvas.html')
    axios.get(canvasPageURL).then((response) => {
      document.body.lastChild.insertAdjacentHTML('afterend', response.data)
      document.querySelector("#abwaSidebarButton").style.display = "none"

      let canvasContainer = document.querySelector("#canvasContainer")
      document.querySelector("#canvasOverlay").addEventListener("click",function(){
        document.querySelector("#reviewCanvas").parentNode.removeChild(document.querySelector("#reviewCanvas"))
        document.querySelector("#abwaSidebarButton").style.display = "block"
      })
      document.querySelector("#canvasContainer").addEventListener("click",function(e){
        e.stopPropagation()
      })
      document.addEventListener("keydown",function(e){
        if(e.keyCode==27&&document.querySelector("#reviewCanvas")!=null) document.querySelector("#reviewCanvas").parentNode.removeChild(document.querySelector("#reviewCanvas"))
        document.querySelector("#abwaSidebarButton").style.display = "block"
      })
      document.querySelector("#canvasCloseButton").addEventListener("click",function(){
        document.querySelector("#reviewCanvas").parentNode.removeChild(document.querySelector("#reviewCanvas"))
        document.querySelector("#abwaSidebarButton").style.display = "block"
      })

      let canvasClusters = {}
      let criteriaList = []
      abwa.tagManager.currentTags.forEach((e) => {
        //if(e.config.name=="Typos") return
        criteriaList.push(e.config.name)
        if(canvasClusters[e.config.options.group]==null) canvasClusters[e.config.options.group] = [e.config.name]
        else canvasClusters[e.config.options.group].push(e.config.name)
      })

      review.annotations.forEach((e) => {
        if(e.criterion=="Typos"||criteriaList.indexOf(e.criterion)!=-1) return
        if(canvasClusters["Other"]==null) canvasClusters["Other"] = [e.criterion]
        else canvasClusters["Other"].push(e.criterion)
        criteriaList.push(e.criterion)
      })

      let clusterTemplate = document.querySelector("#propertyClusterTemplate")
      let columnTemplate = document.querySelector("#clusterColumnTemplate")
      let propertyTemplate = document.querySelector("#clusterPropertyTemplate")
      let annotationTemplate = document.querySelector("#annotationTemplate")
      //let clusterHeight = 100.0/Object.keys(canvasClusters).length

      let getCriterionLevel = (annotations) => {
        if(annotations.length===0) return 'emptyCluster'
        if(annotations[0].level==null||annotations[0].level=='') return 'unsorted'
        let criterionLevel = annotations[0].level
        for(let i=1;i<annotations.length;i++){
          if(annotations[i].level==null||annotations[i].level=='') return 'unsorted'
          else if(annotations[i].level!=criterionLevel) return 'unsorted'
        }
        return criterionLevel.replace(/\s/g,'')
      }

      let displayAnnotation = (annotation) => {
        let swalContent = '';
        if (annotation.highlightText != null && annotation.highlightText != '') swalContent += '<h2 style="text-align:left;margin-bottom:10px;">Highlight</h2><div style="text-align:justify;font-style:italic">"' + annotation.highlightText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '"</div>'
        if (annotation.comment != null && annotation.comment != '') swalContent += '<h2 style="text-align:left;margin-top:10px;margin-bottom:10px;">Comment</h2><div style="text-align:justify;">' + annotation.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
        ReviewGenerator.tryToLoadSwal()
        if (_.isNull(Swal)) {
          Alerts.errorAlert({text: 'Unable to load swal'})
        } else {
          Swal({
            html: swalContent,
            confirmButtonText: "View in context"
          }).then((result) => {
            if (result.value) {
              document.querySelector("#reviewCanvas").parentNode.removeChild(document.querySelector("#reviewCanvas"))
              window.abwa.contentAnnotator.goToAnnotation(window.abwa.contentAnnotator.allAnnotations.find((e) => {return e.id == annotation.id}))
              document.querySelector("#abwaSidebarButton").style.display = "block"
            }
          })
        }
      }
      let getGroupAnnotationCount = (group) => {
        let i = 0
        canvasClusters[group].forEach((e) => {i += review.annotations.filter((a) => {return a.criterion===e}).length})
        return i
      }
      let getColumnAnnotationCount = (properties) => {
        let i = 0
        properties.forEach((e) => {i += review.annotations.filter((a) => {return a.criterion===e}).length})
        return i
      }
      let getGroupHeight = (group) => {
        if(review.annotations.filter((e)=>{return e.criterion!=="Typos"}).length===0) return 33.3333
        return 15.0+getGroupAnnotationCount(group)*(100.0-15*Object.keys(canvasClusters).length)/review.annotations.filter((e)=>{return e.criterion!=="Typos"}).length
      }
      let getColumnWidth = (properties,group) => {
        let colNum = canvasClusters[group].length===2 ? 2 : Math.ceil(canvasClusters[group].length/2)
        if(getGroupAnnotationCount(group)===0) return 100.0/Math.ceil(canvasClusters[group].length/2)
        return 15.0+getColumnAnnotationCount(properties)*(100.0-15*colNum)/getGroupAnnotationCount(group)
      }
      let getPropertyHeight = (property,properties) => {
        if(properties.length==1) return 100
        if(getColumnAnnotationCount(properties)==0&&properties.length==2) return 50
        return 15.0+review.annotations.filter((e)=>{return e.criterion===property}).length*(100.0-15*2)/getColumnAnnotationCount(properties)
      }

      for(let key in canvasClusters){
        let clusterElement = clusterTemplate.content.cloneNode(true)
        //clusterElement.querySelector(".propertyCluster").style.height = clusterHeight+'%'
        clusterElement.querySelector(".propertyCluster").style.height = getGroupHeight(key)+'%'
        clusterElement.querySelector(".clusterLabel span").innerText = key
        let clusterContainer = clusterElement.querySelector('.clusterContainer')
        let currentColumn = null
        for(let i=0;i<canvasClusters[key].length;i++){
          if(i%2==0||canvasClusters[key].length==2){
            currentColumn = columnTemplate.content.cloneNode(true)
            if(canvasClusters[key].length==1) currentColumn.querySelector('.clusterColumn').style.width = "100%"
            /*else if(canvasClusters[key].length==2) currentColumn.querySelector('.clusterColumn').style.width = "50%"
            else currentColumn.querySelector('.clusterColumn').style.width = parseFloat(100.0/Math.ceil(canvasClusters[key].length/2)).toString()+'%'*/
            else{
              let columnWidth
              if (canvasClusters[key].length === 2) {
                columnWidth = getColumnWidth([canvasClusters[key][i]], key)
                if (getColumnAnnotationCount(canvasClusters[key]) === 0) {
                  currentColumn.querySelector('.clusterColumn').style.height = 50 + '%'
                }
              } else if (i < canvasClusters[key].length - 1) columnWidth = getColumnWidth([canvasClusters[key][i], canvasClusters[key][i + 1]], key)
              else columnWidth = getColumnWidth([canvasClusters[key][i]], key)
              currentColumn.querySelector('.clusterColumn').style.width = columnWidth + '%'
            }
          }
          let clusterProperty = propertyTemplate.content.cloneNode(true)
          clusterProperty.querySelector(".propertyLabel").innerText = canvasClusters[key][i]
          let criteria = review._allCriteria.filter((e) => {return e._criterion === canvasClusters[key][i]})
          /*if(canvasClusters[key].length==1||canvasClusters[key].length==2||(canvasClusters[key].length%2==1&&i==canvasClusters[key].length-1)) clusterProperty.querySelector(".clusterProperty").style.height = "100%"
          else clusterProperty.querySelector(".clusterProperty").style.height = "50%";*/
          let propertyHeight = 100
          if(canvasClusters[key].length==2) propertyHeight = getPropertyHeight(canvasClusters[key][i],[canvasClusters[key][i]])
          else if(i%2==0&&i<canvasClusters[key].length-1) propertyHeight = getPropertyHeight(canvasClusters[key][i],[canvasClusters[key][i],canvasClusters[key][i+1]])
          else if(i%2==1) propertyHeight = getPropertyHeight(canvasClusters[key][i],[canvasClusters[key][i],canvasClusters[key][i-1]])
          clusterProperty.querySelector(".clusterProperty").style.height = propertyHeight+'%'
          clusterProperty.querySelector(".clusterProperty").style.width = "100%";

          let criterionAnnotations = review.annotations.filter((e) => {return e.criterion === canvasClusters[key][i]})
          // if(criterionAnnotations.length==0) clusterProperty.querySelector('.propertyAnnotations').style.display = 'none'
          clusterProperty.querySelector('.clusterProperty').className += ' '+getCriterionLevel(criterionAnnotations)

          let annotationWidth = 100.0/criterionAnnotations.length
          let annotationElement
          annotationElement = annotationTemplate.content.cloneNode(true)
          annotationElement.querySelector('.canvasAnnotation').style.width = annotationWidth+'%'
          if (criteria.length > 0) {
            criteria = criteria[0]
            if (criteria._fullQuestion) {
              annotationElement.querySelector('.canvasAnnotation').innerHTML += '<b>' + criteria._fullQuestion.fullQuestion + '</b>'
            } else {
              annotationElement.querySelector('.canvasAnnotation').innerHTML += '<b>' + criteria._description + '</b>'
            }
            if (criteria._compile) {
              annotationElement.querySelector('.canvasAnnotation').innerHTML += criteria._compile.answer
            }
          }
          clusterProperty.querySelector('.propertyAnnotations').appendChild(annotationElement)
          for(let j=0;j<criterionAnnotations.length;j++){
            if(criterionAnnotations[j].highlightText!=null) clusterProperty.querySelector('.canvasAnnotation').innerHTML += '<i>"( '+criterionAnnotations[j].highlightText+')"</i>'
          }

          currentColumn.querySelector('.clusterColumn').appendChild(clusterProperty)
          if(i%2==1||i==canvasClusters[key].length-1||canvasClusters[key].length==2) clusterContainer.appendChild(currentColumn)
        }
        canvasContainer.appendChild(clusterElement)
      }
      Alerts.closeAlert()
    })
  }

  deleteAnnotations () {
    // Ask user if they are sure to delete it
    Alerts.confirmAlert({
      alertType: Alerts.alertType.question,
      title: chrome.i18n.getMessage('DeleteAllAnnotationsConfirmationTitle'),
      text: chrome.i18n.getMessage('DeleteAllAnnotationsConfirmationMessage'),
      callback: (err, toDelete) => {
        // It is run only when the user confirms the dialog, so delete all the annotations
        if (err) {
          // Nothing to do
        } else {
          // Dispatch delete all annotations event
          LanguageUtils.dispatchCustomEvent(Events.deleteAllAnnotations)
          // TODO Check if it is better to maintain the sidebar opened or not
          window.abwa.sidebar.openSidebar()
        }
      }
    })

  }

  resume (){
    if(window.abwa.contentAnnotator.allAnnotations.length>0) window.abwa.contentAnnotator.goToAnnotation(window.abwa.contentAnnotator.allAnnotations.reduce((max,a) => new Date(a.updated) > new Date(max.updated) ? a : max))
  }

  destroy (callback) {
    // Remove toolbar
    this.container.remove()

    // Callback
    if (_.isFunction(callback)) {
      callback()
    }
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

export default ReviewGenerator
