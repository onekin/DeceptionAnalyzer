const Events = {
  annotate: 'annotate',
  annotateByLLM: 'annotateByLLM',
  annotationCreated: 'annotationCreated',
  annotationDeleted: 'annotationDeleted',
  annotationValidated: 'annotationValidated',
  groupChanged: 'groupChanged',
  mark: 'mark',
  modeChanged: 'modeChanged',
  userFilterChange: 'userFilterChange',
  updatedAllAnnotations: 'updatedAllAnnotations',
  updatedDocumentURL: 'updatedDocumentURL',
  comment: 'annotationComment',
  updateAnnotation: 'updateAnnotation',
  updateTagAnnotation: 'updateTagAnnotation',
  updateTagAnnotations: 'updateTagAnnotations',
  reply: 'reply',
  tagsUpdated: 'tagsUpdated',
  deleteAllAnnotations: 'deleteAllAnnotations',
  deletedAllAnnotations: 'deletedAllAnnotations'
}

module.exports = Events
