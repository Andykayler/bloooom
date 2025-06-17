function Model(){
    return (
    
    <div className="modal" id="newExamModal">
    <div className="modal-content">
        <div className="modal-header">
            <h3 className="modal-title">Create New Exam</h3>
            <button className="modal-close" id="closeModal">&times;</button>
        </div>
        <form id="examForm">
            <div className="form-group">
                <label className="form-label">Exam Title</label>
                <input type="text" className="form-input" id="examTitle" required />
            </div>
            <div className="form-group">
                <label className="form-label">Subject</label>
                <input type="text" className="form-input" id="examSubject" required />
            </div>
            <div className="form-group">
                <label className="form-label">Grade Level</label>
                <input type="text" className="form-input" id="examGrade" required />
            </div>
            <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-input" id="examDueDate" required />
            </div>
            <div className="form-group">
                <label className="form-label">Duration (minutes)</label>
                <input type="number" className="form-input" id="examDuration" required />
            </div>
            <div className="form-actions">
                <button type="button" className="btn btn-outline" id="cancelExam">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Exam</button>
            </div>
        </form>
    </div>
</div>
    );
}
export default Model;